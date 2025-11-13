// Initialize the map
var map = L.map('map').setView([20.5937, 78.9629], 5); // Center the map at some default location

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

var rays = [];
var selectedRays = [];
var polylineOptions = { color: 'red' };
var intersectionMarkers = [];
var ellipseLayer = null;

// Function to convert degrees to radians
function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

// Function to calculate the destination point given start point, bearing, and distance
function calculateDestinationPoint(lat, lon, bearing, distance) {
    const R = 6371000; // Radius of the Earth in meters
    const φ1 = toRadians(lat);
    const λ1 = toRadians(lon);
    const θ = toRadians(bearing);
    const δ = distance / R;

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) +
        Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
        Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

    return [φ2 * 180 / Math.PI, λ2 * 180 / Math.PI];
}

// Function to draw a ray on the map
function drawRay(lat, lon, bearing, distance) {
    const [destLat, destLon] = calculateDestinationPoint(lat, lon, bearing, distance);
    var line = L.polyline([[lat, lon], [destLat, destLon]], polylineOptions).addTo(map);
    
    // Add click event to the line to toggle selection
    line.on('click', function() {
        if (line.options.color === 'red') {
            line.setStyle({ color: 'blue' });
            selectedRays.push(line);
        } else {
            line.setStyle({ color: 'red' });
            selectedRays = selectedRays.filter(ray => ray !== line);
        }
    });

    rays.push(line);
}

// Function to calculate intersection of two lines
function lineIntersection(line1, line2) {
    var x1 = line1[0].lng, y1 = line1[0].lat,
        x2 = line1[1].lng, y2 = line1[1].lat,
        x3 = line2[0].lng, y3 = line2[0].lat,
        x4 = line2[1].lng, y4 = line2[1].lat;

    var denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return null; // Lines are parallel

    var ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    var ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null; // Intersection not on the segments

    var x = x1 + ua * (x2 - x1);
    var y = y1 + ua * (y2 - y1);

    return L.latLng(y, x);
}

// Function to add a marker for an intersection point
function addIntersectionMarker(point) {
    var marker = L.marker(point, { icon: L.divIcon({ className: 'intersection' }) }).addTo(map);
    marker.bindPopup(`Intersection at: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`);
    intersectionMarkers.push(marker);
}

// Function to process Excel file
function processExcel(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type: 'array' });

        var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        rows.forEach(row => {
            var lat = parseFloat(row[0]);
            var lon = parseFloat(row[1]);
            var azimuth = parseFloat(row[2]);
            var distance = parseFloat(row[3]);

            if (!isNaN(lat) && !isNaN(lon) && !isNaN(azimuth) && !isNaN(distance)) {
                drawRay(lat, lon, azimuth, distance);
            }
        });
    };
    reader.readAsArrayBuffer(file);
}

// Add event listener for 'Add Ray' button
document.getElementById('addRay').addEventListener('click', function() {
    var lat = parseFloat(document.getElementById('latitude').value);
    var lon = parseFloat(document.getElementById('longitude').value);
    var azimuth = parseFloat(document.getElementById('azimuth').value);
    var distance = parseFloat(document.getElementById('distance').value);

    if (!isNaN(lat) && !isNaN(lon) && !isNaN(azimuth) && !isNaN(distance)) {
        drawRay(lat, lon, azimuth, distance);
    } else {
        alert("Please enter valid numbers for all fields.");
    }
});

// Add event listener for 'Calculate Intersection' button
document.getElementById('calculateIntersection').addEventListener('click', function() {
    if (rays.length < 3) {
        alert("Please add at least three rays.");
        return;
    }

    // Clear previous intersection markers
    intersectionMarkers.forEach(marker => map.removeLayer(marker));
    intersectionMarkers = [];

    var intersections = [];

    for (var i = 0; i < rays.length; i++) {
        for (var j = i + 1; j < rays.length; j++) {
            var intersection = lineIntersection(rays[i].getLatLngs(), rays[j].getLatLngs());
            if (intersection) intersections.push(intersection);
        }
    }

    if (intersections.length === 0) {
        console.log("No intersections found.");
    } else {
        intersections.forEach(point => addIntersectionMarker(point));
        drawEllipse(intersections);
    }
});

// Function to draw ellipse through intersection points
function drawEllipse(points) {
    if (ellipseLayer) {
        map.removeLayer(ellipseLayer);
    }

    // Calculate the centroid of the points
    var centroidLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    var centroidLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;

    // Calculate the average distance from the centroid to the points for the semi-major axis
    var semiMajorAxis = points.reduce((sum, p) => sum + map.distance([centroidLat, centroidLng], [p.lat, p.lng]), 0) / points.length;

    // Set the semi-minor axis to a smaller fraction of the semi-major axis for demonstration purposes
    var semiMinorAxis = semiMajorAxis * 0.6;

    // Draw the ellipse
    ellipseLayer = L.ellipse([centroidLat, centroidLng], [semiMajorAxis, semiMinorAxis], 0, {
        color: 'yellow',
        weight: 2
    }).addTo(map);
}

// Add event listener for 'Remove Selected Rays' button
document.getElementById('removeSelectedRays').addEventListener('click', function() {
    selectedRays.forEach(ray => map.removeLayer(ray));
    rays = rays.filter(ray => !selectedRays.includes(ray));
    selectedRays = [];
});

// Add event listener for file input
document.getElementById('fileInput').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (file) {
        processExcel(file);
    }
});
