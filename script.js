// Set maptiler Access Token
maptilersdk.config.apiKey = 'Ta217gUfNOdRQGdR4t0Q';

// Initialize the map
const map = new maptilersdk.Map({
    container: 'map',
    style: 'https://api.maptiler.com/maps/c4e477b9-ca5a-47f4-a752-ee0d893bdde5/style.json?key=Ta217gUfNOdRQGdR4t0Q',
    center: [-5.076575, 54.702354], // Initial center point (UK)
    zoom: 5
});

// Dynamically generate year options
const yearSelect = document.getElementById('year');
for (let year = 2000; year <= 2023; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.text = year;
    yearSelect.appendChild(option);
}
yearSelect.value = 2023; // Default to the latest year

// Cargo type icon mapping
const cargoIcons = {
    'All Cargo': 'fa-box',
    'Dry Bulk': 'fa-mountain',
    'Liquid Bulk': 'fa-oil-can',
    'Lo-Lo': 'fa-cogs',
    'Main Freight': 'fa-ship',
    'Other General Cargo': 'fa-box-open',
    'Ro-Ro Non-SP': 'fa-scroll',
    'Ro-Ro Self-Prop': 'fa-car'
};

// Color scale
const colorScale = d3.scaleOrdinal()
    .domain(['All Cargo', 'Dry Bulk', 'Liquid Bulk', 'Lo-Lo', 'Main Freight', 'Other General Cargo', 'Ro-Ro Non-SP', 'Ro-Ro Self-Prop'])
    .range(d3.schemeTableau10);

// Data filtering function
function filterData(data, year, direction) {
    return data.filter(d => d.Year == year && d.Direction == direction);
}

// Update legend
function updateLegend(data) {
    const cargoGroups = [...new Set(data.map(d => d['Cargo Group Name']))];
    const legend = d3.select('#legend');

    // Clear legend content
    legend.html('');

    // Add title
    legend.append('div')
        .attr('class', 'legend-title')
        .text('Cargo Type');

    // Add legend items for each cargo type
    cargoGroups.forEach(group => {
        const description = getCargoDescription(group); // Get cargo type description
        legend.append('div')
            .attr('class', 'legend-item')
            .html(`
                <div class="legend-icon" style="color: ${colorScale(group)};">
                    <i class="fas ${cargoIcons[group] || 'fa-question'}"></i>
                </div>
                <div class="legend-label">
                    <strong>${group}</strong><br>
                    <span class="legend-description">${description}</span>
                </div>
            `);
    });
}

// Get cargo type description
function getCargoDescription(cargoType) {
    const descriptions = {
        'All Cargo': 'Total volume of all cargo types at the port.',
        'Dry Bulk': 'Unpackaged solid cargo like coal, grain, and ores.',
        'Liquid Bulk': 'Bulk liquids like crude oil, chemicals, and LNG.',
        'Lo-Lo': 'Crane-loaded containerized cargo.',
        'Main Freight': 'Large-scale international trade cargo.',
        'Other General Cargo': 'Miscellaneous packaged and palletized goods.',
        'Ro-Ro Non-SP': 'Towed roll-on/roll-off cargo like trailers.',
        'Ro-Ro Self-Prop': 'Self-driving roll-on/roll-off cargo like cars.'
    };
    return descriptions[cargoType] || 'No description available.';
}

// Update map
let currentPopup = null; // Store the current popup instance

function updateMap(data, year, direction) {
    const filteredData = filterData(data, year, direction);

    if (filteredData.length === 0) {
        alert('No data available for the selected year and direction.');
        return;
    }

    // Remove old layers and sources
    if (map.getLayer('ports')) {
        map.removeLayer('ports');
    }
    if (map.getLayer('port-labels')) {
        map.removeLayer('port-labels');
    }
    if (map.getSource('ports')) {
        map.removeSource('ports');
    }

    // Add new source and layer
    map.addSource('ports', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: filteredData.map(d => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [+d['Published Port Long'], +d['Published Port Lat']]
                },
                properties: {
                    name: d['Port Name'],
                    tonnage: +d.Tonnage,
                    cargoGroup: d['Cargo Group Name']
                }
            }))
        }
    });

    map.addLayer({
        id: 'ports',
        type: 'circle',
        source: 'ports',
        paint: {
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['get', 'tonnage'],
                0, 15,
                10000, 30,
                100000, 45,
                1000000, 60
            ],
            'circle-color': [
                'interpolate',
                ['linear'],
                ['get', 'tonnage'],
                0, 'rgba(255, 120, 0, 0.2)',
                10000, 'rgba(255, 120, 0, 0.5)',
                100000, 'rgba(255, 120, 0, 0.8)',
                1000000, 'rgba(255, 120, 0, 1)'
            ],
            'circle-opacity': 0.8,
            'circle-stroke-width': 0.1,
            'circle-stroke-color': '#000'
        }
    });

    // Add label layer for port names
    map.addLayer({
        id: 'port-labels',
        type: 'symbol',
        source: 'ports',
        layout: {
            'text-field': ['get', 'name'],
            'text-size': 12,
            'text-offset': [0, 1],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-ignore-placement': false
        },
        paint: {
            'text-color': '#000',
            'text-halo-color': '#fff',
            'text-halo-width': 1
        }
    });

    // Remove old click event listeners
    map.off('click', 'ports');

    // Bind new click event listeners
    map.on('click', 'ports', e => {
        // Close previous popup
        if (currentPopup) {
            currentPopup.remove();
        }

        const portName = e.features[0].properties.name;
        const portData = filteredData.filter(d => d['Port Name'] === portName);

        const cargoData = d3.groups(portData, d => d['Cargo Group Name'])
            .map(d => ({
                cargoGroup: d[0],
                tonnage: d3.sum(d[1], v => +v.Tonnage)
            }));

        // Create new popup
        currentPopup = new maptilersdk.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
                <div class="popup-content">
                    <strong>${portName}</strong><br>
                    <div class="total-tonnage">Tonnage: ${d3.sum(cargoData, d => d.tonnage).toLocaleString()} t</div>
                    <ul class="cargo-list">
                        ${cargoData.map(d => `<li>${d.cargoGroup}: ${d.tonnage.toLocaleString()} t</li>`).join('')}
                    </ul>
                    <div class="pie-chart"></div>
                </div>
            `)
            .addTo(map);

        // Use PieChart to draw a pie chart
        const pieChartContainer = currentPopup.getElement().querySelector('.pie-chart');
        pieChartContainer.innerHTML = '';
        pieChartContainer.appendChild(
            PieChart(cargoData, {
                name: d => d.cargoGroup,
                value: d => d.tonnage,
                width: 200,
                height: 200,
                innerRadius: 40,
                outerRadius: 80,
                labelRadius: 60,
                colors: d3.schemeTableau10,
                stroke: 'white',
                strokeWidth: 1,
                padAngle: 0.02
            })
        );
    });

    // Mouse hover effect
    map.off('mouseenter', 'ports');
    map.off('mouseleave', 'ports');
    map.on('mouseenter', 'ports', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'ports', () => {
        map.getCanvas().style.cursor = '';
    });

    // Update legend
    updateLegend(filteredData);
}

// Search for port
function searchPort(data, portName) {
    const year = yearSelect.value;
    const direction = document.getElementById('direction').value;
    const filteredData = filterData(data, year, direction);
    const matchedPorts = filteredData.filter(d => 
        d['Port Name'].toLowerCase().includes(portName.toLowerCase())
    );

    if (matchedPorts.length > 0) {
        const firstPort = matchedPorts[0];
        map.flyTo({
            center: [+firstPort['Published Port Long'], +firstPort['Published Port Lat']],
            zoom: 10
        });

        const popup = new maptilersdk.Popup()
            .setLngLat([+firstPort['Published Port Long'], +firstPort['Published Port Lat']])
            .setHTML(`
                <strong>${firstPort['Port Name']}</strong>
            `)
            .addTo(map);
    } else {
        alert('Port not found');
    }
}


// Ensure that the map style is loaded before performing operations
map.on('load', () => {
    console.log('Map style loaded, safe to update the map.');

    // Read processed data
    d3.csv('https://raw.githubusercontent.com/key0208/Freight-Traffic-in-UK-Ports/refs/heads/main/data%20download%20and%20process/4%20processed_port_data.csv')
        .then(data => {
            if (!data || data.length === 0) {
                throw new Error('Data is empty or not found');
            }
            console.log('Data loaded successfully:', data);

            // Hide loading indicator
            document.getElementById('loading').style.display = 'none';

            // Initial map load
            updateMap(data, '2023', 'Inwards');

            // Event listener: update map when filter changes
            document.getElementById('year').addEventListener('change', () => {
                const year = yearSelect.value;
                const direction = document.getElementById('direction').value;
                updateMap(data, year, direction);
            });

            document.getElementById('direction').addEventListener('change', () => {
                const year = yearSelect.value;
                const direction = document.getElementById('direction').value;
                updateMap(data, year, direction);
            });

            // Search button click event
            document.getElementById('search-button').addEventListener('click', () => {
                const portName = document.getElementById('search').value;
                if (portName) {
                    searchPort(data, portName);
                }
            });

            // Input box enter key event
            document.getElementById('search').addEventListener('keypress', e => {
                if (e.key === 'Enter') {
                    const portName = document.getElementById('search').value;
                    if (portName) {
                        searchPort(data, portName);
                    }
                }
            });
        })
        .catch(error => {
            console.error('Error loading CSV data:', error);
            alert('Data load failed, please try again later.');
        });
});

// PieChart function
function PieChart(data, {
    name = ([x]) => x,
    value = ([, y]) => y,
    title,
    width = 640,
    height = 400,
    innerRadius = 0,
    labelRadius,
    format = ",",
    names,
    colors,
    stroke,
    strokeWidth = 1,
    strokeLinejoin = "round",
    padAngle
} = {}) {
    const outerRadius = Math.min(width, height) / 2;
    if (labelRadius === undefined) {
        labelRadius = (innerRadius * 0.5 + outerRadius * 0.5);
    }
    if (padAngle === undefined) {
        padAngle = stroke === "none" ? 1 / outerRadius : 0;
    }

    const N = d3.map(data, name);
    const V = d3.map(data, value);
    const I = d3.range(N.length).filter(i => !isNaN(V[i]));

    if (names === undefined) names = N;
    names = new d3.InternSet(names);

    if (colors === undefined) colors = d3.schemeSpectral[names.size];
    if (colors === undefined) colors = d3.quantize(t => d3.interpolateSpectral(t * 0.8 + 0.1), names.size);

    const color = d3.scaleOrdinal(names, colors);

    if (title === undefined) {
        const formatValue = d3.format(format);
        title = i => `${N[i]}\n${formatValue(V[i])}`;
    } else {
        const O = d3.map(data, d => d);
        const T = title;
        title = i => T(O[i], i, data);
    }

    const arcs = d3.pie().padAngle(padAngle).sort(null).value(i => V[i])(I);
    const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);
    const arcLabel = d3.arc().innerRadius(labelRadius).outerRadius(labelRadius);

    const totalTonnage = d3.sum(data, d => d.tonnage);

    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .attr("style", "max-width: 100%; height: auto; height: intrinsic;");

    svg.append("g")
        .attr("stroke", stroke)
        .attr("stroke-width", strokeWidth)
        .attr("stroke-linejoin", strokeLinejoin)
        .selectAll("path")
        .data(arcs)
        .join("path")
        .attr("fill", d => color(N[d.data]))
        .attr("d", arc)
        .append("title")
        .text(d => title(d.data));

    svg.append("g")
        .attr("font-family", "sans-serif")
        .attr("font-size", 15)
        .attr("text-anchor", "middle")
        .selectAll("text")
        .data(arcs)
        .join("text")
        .attr("transform", d => `translate(${arcLabel.centroid(d)})`)
        .attr("fill", "#000")
        .attr("paint-order", "stroke")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .selectAll("tspan")
        .data(d => {
            const percentage = (V[d.data] / totalTonnage) * 100;
            return percentage >= 4 ? [`${percentage.toFixed(1)}%`] : [];
        })
        .join("tspan")
        .attr("x", 0)
        .attr("y", (_, i) => `${i * 1.1}em`)
        .attr("font-weight", "bold")
        .text(d => d);

    return Object.assign(svg.node(), { scales: { color } });
}
