from flask import Flask, render_template, request, jsonify
import multiprocessing as mp
import numpy as np
import json
import time
import os
import traceback

from worker import run_attack_task
from utils import load_graph_from_json

app = Flask(__name__)

# true - последовательный и параллельный режим
# false - только параллельный
BENCHMARK_MODE = True  
TOTAL_CORES = os.cpu_count() or 1
NUM_CORES = max(1, TOTAL_CORES - 2)      
DEFAULT_STEPS = 20
DEFAULT_NODES_PER_STEP = 5

def run_all_tasks_sequential(edge_list, is_directed, is_weighted, scenarios, steps, nodes_per_step, original_weights=None):
    results = {}
    for scenario in scenarios:
        repeats = 16 if scenario == 'random' else 1
        scenario_results = []
        for i in range(repeats):
            seed = 42 + i * 1000
            res = run_attack_task(edge_list, scenario, steps, nodes_per_step, seed, 
                                num_cores=1, is_directed=is_directed, is_weighted=is_weighted, original_weights=original_weights)
            scenario_results.append(res)
        results[scenario] = scenario_results
    return results

def run_all_tasks_optimized(edge_list, is_directed, is_weighted, scenarios, steps, nodes_per_step, original_weights=None):
    results = {}
    for scenario in scenarios:
        repeats = 16 if scenario == 'random' else 1
        scenario_results = []
        for i in range(repeats):
            seed = 42 + i * 1000
            res = run_attack_task(edge_list, scenario, steps, nodes_per_step, seed, 
                                num_cores=NUM_CORES, is_directed=is_directed, is_weighted=is_weighted, original_weights=original_weights)
            scenario_results.append(res)
        results[scenario] = scenario_results
    return results

def aggregate_results(results):
    aggregated = {}
    for scenario, data_list in results.items():
        gcc_histories = [d['gcc_history'] for d in data_list]
        matrix = np.array(gcc_histories)
        
        mean_gcc = matrix.mean(axis=0).tolist()
        
        removed_nodes = data_list[0]['removed_nodes_history']
        
        aggregated[scenario] = {
            'gcc_mean': mean_gcc,
            'removed_nodes': removed_nodes
        }
    return aggregated

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/run', methods=['POST'])
def run_analysis():
    try:
        data = request.json
        graph_json = data['graph_json']
        
        g, node_map = load_graph_from_json(graph_json)
        is_directed = g.is_directed()
        is_weighted = any('weight' in d for u, v, d in g.edges(data=True))
        
        scenarios = data.get('scenarios', ['degree', 'betweenness', 'closeness', 'random'])
        steps = int(data.get('steps', DEFAULT_STEPS))
        nodes_per_step = int(data.get('nodes_per_step', DEFAULT_NODES_PER_STEP))
        
        if is_weighted:
            edge_list = []
            original_weights = {}
            for u, v, d in g.edges(data=True):
                w_strength = float(d.get('weight', 1.0))
                w_distance = 1.0 / (w_strength + 1e-6)
                edge_list.append((u, v, w_distance))
                original_weights[(u, v)] = w_strength
        else:
            edge_list = list(g.edges())
            original_weights = None
        
        t_seq = 0.0
        if BENCHMARK_MODE:
            start = time.time()
            run_all_tasks_sequential(edge_list, is_directed, is_weighted, scenarios, steps, nodes_per_step, original_weights)
            t_seq = time.time() - start

        start = time.time()
        results = run_all_tasks_optimized(edge_list, is_directed, is_weighted, scenarios, steps, nodes_per_step, original_weights)
        t_par = time.time() - start

        report = aggregate_results(results)

        print(f"ОТЧЕТ: граф {g.number_of_nodes()} узлов, Directed: {is_directed}, Weighted: {is_weighted}", flush=True)
        print(f"Сценарии: {', '.join(scenarios)}", flush=True)
        print(f"Всего ядер на устройстве (TOTAL_CORES): {TOTAL_CORES}", flush=True)
        print(f"Используется ядер для расчетов (NUM_CORES): {NUM_CORES}", flush=True)

        print(f"Паралл. время (t_par): {t_par:.3f} сек", flush=True)
        if BENCHMARK_MODE:
            speedup = t_seq / t_par if t_par > 0 else 1.0
            p = (NUM_CORES * (speedup - 1)) / (speedup * (NUM_CORES - 1))
            print(f"Послед. время (t_seq): {t_seq:.3f} сек", flush=True)
            print(f"Ускорение (Speedup):  {speedup:.2f}x", flush=True)
            print(f"Доля паралл. работы (p):  {p:.2f}", flush=True)

        return jsonify({
            'success': True,
            'results': report
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/demo_graph/<string:g_type>/<int:size>/<string:suffix>', methods=['GET'])
def demo_graph(g_type, size, suffix):

    suf = f"_{suffix}" if suffix != "none" else ""
    
    filename = os.path.join('data', f'{g_type}_{size}{suf}.json')
    
    if not os.path.exists(filename):
        return jsonify({'error': f'Файл {filename} не найден.'}), 404
    
    with open(filename, 'r') as f:
        graph_data = json.load(f)
    return jsonify(graph_data)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)