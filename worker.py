import networkx as nx
import random 

from utils import (
    select_nodes_by_degree,
    select_nodes_by_betweenness,
    select_nodes_by_closeness,
    select_nodes_random
)

def run_attack_task(edge_list, scenario, steps, nodes_per_step, seed, num_cores=1, is_directed=False, is_weighted=False, original_weights=None):
    g = nx.DiGraph() if is_directed else nx.Graph()
    if is_weighted:
        g.add_weighted_edges_from(edge_list)
        if original_weights:
            for (u, v), strength in original_weights.items():
                if g.has_edge(u, v):
                    g[u][v]['strength'] = strength
    else:
        g.add_edges_from(edge_list)
    
    total_nodes = g.number_of_nodes()
    gcc_history = []
    removed_nodes_history = []

    rng = random.Random(seed)

    if total_nodes > 0:
        comps = list(nx.weakly_connected_components(g)) if g.is_directed() else list(nx.connected_components(g))
        largest = max(comps, key=len) if comps else []
        gcc_history.append(len(largest) / total_nodes)
    else:
        gcc_history.append(0)
    removed_nodes_history.append([])
    
    for step in range(steps):
        if g.number_of_nodes() == 0:
            gcc_history.append(0.0)
            removed_nodes_history.append([])
            continue

        if scenario == 'degree':
            nodes_to_remove = select_nodes_by_degree(g, nodes_per_step, is_directed=is_directed, is_weighted=is_weighted)
        elif scenario == 'betweenness':
            nodes_to_remove = select_nodes_by_betweenness(g, nodes_per_step, processes=num_cores, is_weighted=is_weighted)
        elif scenario == 'closeness':
            nodes_to_remove = select_nodes_by_closeness(g, nodes_per_step, processes=num_cores, is_weighted=is_weighted)
        elif scenario == 'random':
            nodes_to_remove = select_nodes_random(g, nodes_per_step, rng=rng)
        else:
            nodes_to_remove = []

        nodes_to_remove = [n for n in nodes_to_remove if g.has_node(n)]
        removed_nodes_history.append([int(n) for n in nodes_to_remove])
        
        g.remove_nodes_from(nodes_to_remove)
        
        if total_nodes > 0 and g.number_of_nodes() > 0:
            comps = list(nx.weakly_connected_components(g)) if g.is_directed() else list(nx.connected_components(g))
            largest_cc = max(comps, key=len) if comps else []
            current_gcc_rel = len(largest_cc) / total_nodes
        else:
            current_gcc_rel = 0
            
        gcc_history.append(current_gcc_rel)

    return {
        'gcc_history': gcc_history,
        'removed_nodes_history': removed_nodes_history
    }