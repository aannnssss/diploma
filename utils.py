import networkx as nx
import random
import json
import multiprocessing as mp
from functools import partial
from collections import Counter

def load_graph_from_json(json_data):

    if isinstance(json_data, str):
        data = json.loads(json_data)
    else:
        data = json_data
        
    g = nx.readwrite.json_graph.node_link_graph(data)
    node_map = {node: i for i, node in enumerate(g.nodes())}
    return g, node_map

def _betw_chunk(g, is_weighted, nodes_chunk):
    weight_attr = 'weight' if is_weighted else None

    return nx.betweenness_centrality_subset(
        g, 
        sources=nodes_chunk, 
        targets=list(g.nodes()), 
        normalized=False, 
        weight=weight_attr
    )

def select_nodes_by_betweenness(g, num_nodes, processes=6, is_weighted=False):
    if len(g) <= num_nodes: return list(g.nodes())
    
    nodes = list(g.nodes())

    chunks = [nodes[i::processes] for i in range(processes)]
    
    worker_func = partial(_betw_chunk, g, is_weighted)
    
    ctx = mp.get_context('spawn')
    with ctx.Pool(processes=processes) as pool:
        partial_results = pool.map(worker_func, chunks)
    
    full_betweenness = Counter()
    for res in partial_results:
        full_betweenness.update(res)
            
    sorted_nodes = sorted(full_betweenness.items(), key=lambda x: x[1], reverse=True)
    return [n for n, v in sorted_nodes[:num_nodes]]

def _clos_chunk(g, is_weighted, nodes_chunk):

    results = {}
    weight_attr = 'weight' if is_weighted else None
    for node in nodes_chunk:
        results[node] = nx.closeness_centrality(g, u=node, distance=weight_attr)
    return results

def select_nodes_by_closeness(g, num_nodes, processes=6, is_weighted=False):
    if len(g) <= num_nodes: return list(g.nodes())
    
    nodes = list(g.nodes())
    chunks = [nodes[i::processes] for i in range(processes)]
    
    worker_func = partial(_clos_chunk, g, is_weighted)
    
    ctx = mp.get_context('spawn')
    with ctx.Pool(processes=processes) as pool:
        partial_results = pool.map(worker_func, chunks)
        
    full_closeness = {}
    for res in partial_results:
        full_closeness.update(res)
        
    sorted_nodes = sorted(full_closeness.items(), key=lambda x: x[1], reverse=True)
    return [n for n, v in sorted_nodes[:num_nodes]]


def select_nodes_by_degree(g, num_nodes, is_directed=False, is_weighted=False):
    if is_weighted:
        weight_attr = 'strength'
    else:
        weight_attr = None
    if is_directed:
        degrees = dict(g.in_degree(weight=weight_attr))
    else:
        degrees = dict(g.degree(weight=weight_attr))
    sorted_nodes = sorted(degrees.items(), key=lambda x: x[1], reverse=True)
    return [n for n, v in sorted_nodes[:num_nodes]]

def select_nodes_random(g, num_nodes, rng):
    nodes = list(g.nodes())
    if not nodes:
        return []
    return rng.sample(nodes, min(num_nodes, len(nodes)))