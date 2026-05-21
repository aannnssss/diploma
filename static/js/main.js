let currentGraph = null;      
let gccChart = null;          
let cy = null;                
let simulationData = null;    
let currentStep = 0;          
let currentScenarioVis = 'degree'; 

const NODE_LIMIT = 1500;

function shouldRender(nodeCount) {
    if (nodeCount > NODE_LIMIT) {
        document.getElementById('cy').innerHTML = `
            <div style="padding:40px; text-align:center; color:#555; background: #f8fafc; border-radius: 12px;">
                <p style="font-size: 1.2em;"><strong> Граф слишком велик для визуализации (${nodeCount} узлов).</strong></p>
                <p>Статистический анализ выполнен. Отрисовка топологии отключена для стабильности системы.</p>
                <p style="font-size: 0.8em; margin-top: 10px;">(Рекомендуемый предел для браузера: 1500 узлов)</p>
            </div>`;
        return false;
    }
    return true;
}

// ЗАГРУЗКА ДЕМО-ГРАФА
async function loadDemoGraph(size, isDirected, isWeighted) {
    try {
        document.getElementById('results').style.display = 'none';
        let suffix = isDirected && isWeighted ? 'dir_w' : (isDirected ? 'dir' : (isWeighted ? 'w' : 'none'));

        const response = await fetch(`/demo_graph/social/${size}/${suffix}`);
        if (!response.ok) throw new Error('Файл не найден');
        
        const data = await response.json();
        currentGraph = data;
        
        document.getElementById('graphInfo').innerHTML = 
            `Узлов: <strong>${data.nodes.length}</strong>, Ребер: <strong>${data.links.length}</strong>`;

        // Очистка перед новой проверкой
        if (cy) { cy.destroy(); cy = null; }

        if (shouldRender(data.nodes.length)) {
            initCytoscape(data);
        }
        
        if (gccChart) { gccChart.destroy(); gccChart = null; }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

// ЗАГРУЗКА СВОЕГО ГРАФА
document.getElementById('graphFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const loader = document.getElementById('fileLoader');
    const fileNameSpan = document.getElementById('fileName');
    const reader = new FileReader();

    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);
            currentGraph = data;
            const nodeCount = data.nodes.length;

            loader.style.display = 'block';
            
            setTimeout(() => {
                loader.style.display = 'none';
                fileNameSpan.textContent = file.name;
                document.getElementById('graphInfo').innerHTML = 
                    `Файл: <b>${nodeCount}</b> узлов, <b>${data.links.length}</b> ребер`;

                if (cy) { cy.destroy(); cy = null; }

                if (nodeCount > 1500) {
                    alert(`В графе ${nodeCount} узлов. Визуализация удаления отключена для ускорения расчетов. Будет доступен только график деградации.`);
                    shouldRender(nodeCount); 
                } else {
                    initCytoscape(data);
                }
                
                document.getElementById('results').style.display = 'none';
            }, 500);
        } catch (err) {
            loader.style.display = 'none';
            alert("Ошибка в JSON: " + err.message);
        }
    };
    reader.readAsText(file);
});

// ИНИЦИАЛИЗАЦИЯ CYTOSCAPE
function initCytoscape(graphData) {
    const isDirected = graphData.directed || false;
    const isWeighted = graphData.links.length > 0 && graphData.links[0].weight !== undefined;
    const nodeCount = graphData.nodes.length;

    const elements = {
        nodes: graphData.nodes.map(n => ({ data: { id: n.id.toString() } })),
        edges: graphData.links.map(l => ({ 
            data: { 
                source: l.source.toString(), 
                target: l.target.toString(),
                weight: l.weight || 1 
            } 
        }))
    };

    if (cy) { cy.destroy(); }

    cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        pixelRatio: 'auto',
        hideEdgesOnViewport: nodeCount > 500,
        
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': '#764ba2',
                    'width': 20,
                    'height': 20,
                    'border-width': 2,
                    'border-color': '#ffd700',
                    'z-index': 10
                }
            },
            {
                selector: 'node.gcc-active',
                style: {
                    'background-color': '#ffd700',
                    'border-color': '#764ba2',
                    'width': 25,
                    'height': 25,
                    'z-index': 1000
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': isWeighted ? 'mapData(weight, 0.1, 1, 1, 8)' : 1.6,
                    'line-color': '#6b7783',
                    'target-arrow-color': '#6b7783',
                    'opacity': 0.15,
                    'curve-style': 'bezier',
                    'target-arrow-shape': isDirected ? 'vee' : 'none',
                    'arrow-scale': 0.8,
                    'target-distance': 3
                }
            },
            {
                selector: 'edge.gcc-edge',
                style: {
                    'opacity': 0.7,
                    'line-color': '#4a5568',
                    'target-arrow-color': '#4a5568',
                    'z-index': 500
                }
            },
            {
                selector: '.removed',
                style: { 'display': 'none' } 
            }
        ],
        layout: {
            name: 'cose',
            animate: true,
            refresh: 20,
            fit: true,
            padding: 30,
            randomize: true,
            nodeRepulsion: 400000,
            idealEdgeLength: 100,
            nodeOverlap: 20,
            componentSpacing: 100
        }
    });
}

// ЗАПУСК АНАЛИЗА
document.getElementById('runBtn').addEventListener('click', async () => {
    if (!currentGraph) return alert('Загрузите граф!');
    
    const scenarios = Array.from(document.querySelectorAll('input[name="scenario"]:checked')).map(cb => cb.value);
    if (scenarios.length === 0) return alert('Выберите сценарий!');
    
    const progressDiv = document.getElementById('progress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    progressDiv.style.display = 'flex';
    
    try {
        // Фраза 1
        progressText.textContent = "Подготовка данных...";
        progressBar.style.width = "20%";
        await new Promise(r => setTimeout(r, 800));

        // Фраза 2
        progressText.textContent = "Запуск параллельных вычислений...";
        progressBar.style.width = "50%";

        const response = await fetch('/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                graph_json: currentGraph,
                scenarios: scenarios,
                steps: parseInt(document.getElementById('steps').value),
                nodes_per_step: parseInt(document.getElementById('nodesPerStep').value)
            })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        // Фраза 3
        progressText.textContent = "Сборка результатов и отрисовка графиков...";
        progressBar.style.width = "90%";
        await new Promise(r => setTimeout(r, 400));

        simulationData = data.results;
        currentStep = 0;
        
        document.getElementById('results').style.display = 'block';
        displayChart(data);

        if (currentGraph.nodes.length <= 1500) {
            initCytoscape(currentGraph);
            updateGraphVisualization();
        } else {
            document.getElementById('stepLabel').textContent = `Шаг: 0`;
        }
        
        progressBar.style.width = '100%';
        setTimeout(() => {
            progressDiv.style.display = 'none';
            document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
        }, 500);
        
    } catch (error) {
        progressDiv.style.display = 'none';
        alert('Ошибка: ' + error.message);
    }
});

// ГРАФИК
function displayChart(data) {
    const ctx = document.getElementById('gccChart').getContext('2d');
    if (gccChart) gccChart.destroy();
    
    const colors = { 'degree': '#ff6384', 'betweenness': '#36a2eb', 'closeness': '#ffce56', 'random': '#4bc0c0' };
    const datasets = Object.keys(data.results).map(sc => ({
        label: sc.toUpperCase(),
        data: data.results[sc].gcc_mean,
        borderColor: colors[sc],
        fill: false,
        tension: 0.1
    }));

    if (datasets.length === 0) {
        console.warn('Нет данных для отображения графика');
        return;
    }

    gccChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: Array.from({length: datasets[0].data.length}, (_, i) => i), 
            datasets 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: { y: { min: 0, max: 1, title: { display: true, text: 'Размер GCC/WCC' } } } 
        }
    });
}

// ПОШАГОВАЯ ВИЗУАЛИЗАЦИЯ (ИСПРАВЛЕНО)
function updateGraphVisualization() {

    if (!simulationData || !simulationData[currentScenarioVis] || !cy) return;
    
    const nodeCount = currentGraph.nodes.length;

    if (!shouldRender(nodeCount)) {
        document.getElementById('stepLabel').textContent = `Шаг: ${currentStep}`;
        return;
    }

    const history = simulationData[currentScenarioVis].removed_nodes;
    document.getElementById('stepLabel').textContent = `Шаг: ${currentStep}`;

    cy.batch(() => {

        cy.elements().removeClass('removed').removeClass('gcc-active');
        
        for (let i = 0; i <= currentStep; i++) {
            if (history[i]) {
                history[i].forEach(id => {
                    const node = cy.getElementById(id.toString());
                    node.addClass('removed');
                    node.connectedEdges().addClass('removed');
                });
            }
        }

        const activeNodes = cy.nodes().not('.removed');
        
        const activeEdges = activeNodes.connectedEdges().filter(e => {
            return !e.source().hasClass('removed') && !e.target().hasClass('removed');
        });

        const livingSubGraph = activeNodes.union(activeEdges);

        if (activeNodes.length > 0) {

            const components = livingSubGraph.components();
            
            let maxC = components[0];
            components.forEach(c => {
                if (c.nodes().length > maxC.nodes().length) {
                    maxC = c;
                }
            });
            cy.edges().removeClass('gcc-edge');

            if (maxC && maxC.nodes().length > 1) {
                maxC.nodes().addClass('gcc-active');
                maxC.edges().addClass('gcc-edge');
            }
        }
    });

    const alive = cy.nodes().not('.removed');
    if (alive.length > 0) {
        cy.animate({
            fit: { eles: alive, padding: 30 },
            duration: 400
        });
    }
}

// УПРАВЛЕНИЕ
document.getElementById('btnNextStep').onclick = () => {
    if (currentStep < simulationData[currentScenarioVis].removed_nodes.length - 1) {
        currentStep++; updateGraphVisualization();
    }
};
document.getElementById('btnPrevStep').onclick = () => {
    if (currentStep > 0) {
        currentStep--; updateGraphVisualization();
    }
};
document.getElementById('visScenarioSelect').onchange = (e) => {
    currentScenarioVis = e.target.value;
    currentStep = 0;
    updateGraphVisualization();
};
