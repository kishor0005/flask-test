// Global state variables
let serverUptimeSeconds = 0;
let uptimeInterval = null;
let metricsInterval = null;

// Initialize on DOM Content Loaded
document.addEventListener("DOMContentLoaded", () => {
    // Perform initial fetch
    fetchServerInfo();
    measureLatency();
    
    // Set up recurring metrics refresh (every 5 seconds for dashboard responsiveness)
    metricsInterval = setInterval(() => {
        fetchServerInfo(false); // background refresh (don't flash loading states)
    }, 5000);
});

/**
 * Fetch server configuration and resource statistics
 * @param {boolean} triggerLoadingIndicators Whether to show loading text in details container
 */
async function fetchServerInfo(triggerLoadingIndicators = false) {
    const pulseElement = document.getElementById("connection-status-pulse");
    const statusTextElement = document.getElementById("connection-status-text");

    if (triggerLoadingIndicators) {
        document.getElementById("headers-code-block").textContent = "Refreshing HTTP headers...";
        document.getElementById("env-code-block").textContent = "Refreshing environment variables...";
    }

    try {
        const response = await fetch("/api/info");
        if (!response.ok) throw new Error("HTTP error " + response.status);
        
        const data = await response.json();
        
        // Update connection status
        pulseElement.className = "status-pulse online";
        statusTextElement.textContent = "Systems Operational";

        // Update Uptime Clock initial value
        serverUptimeSeconds = Math.floor(data.uptime_seconds);
        if (!uptimeInterval) {
            startUptimeClock();
        }

        // Update Client IP
        document.getElementById("client-ip-value").textContent = data.client_info.ip;

        // Update server times
        document.getElementById("server-time-value").textContent = data.server_time_local.split(" ")[1];

        // Update OS specs
        document.getElementById("spec-os").textContent = data.os_details.system;
        document.getElementById("spec-release").textContent = data.os_details.release;
        document.getElementById("spec-arch").textContent = data.os_details.machine;
        document.getElementById("spec-python").textContent = data.runtime.python_version.split(" ")[0];
        document.getElementById("spec-flask").textContent = data.runtime.flask_version;
        
        // Shorten server gateway software name
        let sw = data.runtime.server_software;
        if (sw.includes("Werkzeug")) sw = "Flask Dev Server (Werkzeug)";
        document.getElementById("spec-server").textContent = sw;

        // Update Resource Metrics
        updateResourceMetrics(data.system_stats);

        // Update details code blocks
        document.getElementById("headers-code-block").textContent = JSON.stringify(data.request_headers, null, 4);
        document.getElementById("env-code-block").textContent = JSON.stringify(data.environment_variables, null, 4);

    } catch (error) {
        console.error("Failed to fetch server info:", error);
        
        // Update connection status to offline
        pulseElement.className = "status-pulse offline";
        statusTextElement.textContent = "Server Unreachable";
        
        // Update resource stats to N/A
        document.getElementById("uptime-value").textContent = "--:--:--";
        document.getElementById("client-ip-value").textContent = "Connection Error";
        document.getElementById("server-time-value").textContent = "Connection Error";
    }
}

/**
 * Perform a latency test to the server ping endpoint
 */
async function measureLatency() {
    const latencyValElement = document.getElementById("latency-value");
    latencyValElement.textContent = "Testing...";
    
    const startTime = performance.now();
    try {
        const response = await fetch("/api/ping");
        if (!response.ok) throw new Error("Ping failed");
        
        const duration = Math.round(performance.now() - startTime);
        latencyValElement.textContent = `${duration} ms`;
        
        // If server is online, restore indicator
        document.getElementById("connection-status-pulse").className = "status-pulse online";
        document.getElementById("connection-status-text").textContent = "Systems Operational";
    } catch (error) {
        console.error("Latency test error:", error);
        latencyValElement.textContent = "Timeout / Error";
        document.getElementById("connection-status-pulse").className = "status-pulse offline";
        document.getElementById("connection-status-text").textContent = "Server Offline";
    }
}

/**
 * Handle resource stats elements and progress bars
 */
function updateResourceMetrics(stats) {
    const cpuBar = document.getElementById("cpu-bar");
    const cpuPercentText = document.getElementById("cpu-percent");
    const ramBar = document.getElementById("ram-bar");
    const ramPercentText = document.getElementById("ram-percent");
    const ramText = document.getElementById("ram-usage-text");
    const metricsNotice = document.getElementById("metrics-notice");

    if (stats && stats.psutil_available) {
        // CPU Metrics
        const cpuUsage = Math.round(stats.cpu_usage_percent);
        cpuBar.style.width = `${cpuUsage}%`;
        cpuPercentText.textContent = `${cpuUsage}%`;

        // RAM Metrics
        const ramUsage = Math.round(stats.memory_usage_percent);
        ramBar.style.width = `${ramUsage}%`;
        ramPercentText.textContent = `${ramUsage}%`;
        ramText.textContent = `${stats.memory_used_gb} GB / ${stats.memory_total_gb} GB`;

        metricsNotice.style.display = "block";
    } else {
        // Disable resource bars if psutil is not available
        cpuBar.style.width = "0%";
        cpuPercentText.textContent = "N/A";
        ramBar.style.width = "0%";
        ramPercentText.textContent = "N/A";
        ramText.textContent = "System metrics package 'psutil' is unavailable";
        metricsNotice.style.display = "none";
    }
}

/**
 * Starts the local interval timer that increments the server uptime second-by-second
 */
function startUptimeClock() {
    const uptimeElement = document.getElementById("uptime-value");
    
    if (uptimeInterval) clearInterval(uptimeInterval);
    
    uptimeInterval = setInterval(() => {
        serverUptimeSeconds++;
        
        const days = Math.floor(serverUptimeSeconds / (3600 * 24));
        const hours = Math.floor((serverUptimeSeconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((serverUptimeSeconds % 3600) / 60);
        const seconds = serverUptimeSeconds % 60;
        
        let uptimeStr = "";
        if (days > 0) {
            uptimeStr += `${days}d `;
        }
        
        const pad = (num) => String(num).padStart(2, '0');
        uptimeStr += `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        
        uptimeElement.textContent = uptimeStr;
    }, 1000);
}

/**
 * Handles Tab navigation inside the details card
 * @param {string} tabName Either 'headers' or 'env'
 */
function switchTab(tabName) {
    // Remove active state from all tabs and panes
    document.getElementById("tab-headers-btn").classList.remove("active");
    document.getElementById("tab-env-btn").classList.remove("active");
    document.getElementById("pane-headers").classList.remove("active");
    document.getElementById("pane-env").classList.remove("active");

    // Add active state to selected tab and pane
    if (tabName === "headers") {
        document.getElementById("tab-headers-btn").classList.add("active");
        document.getElementById("pane-headers").classList.add("active");
    } else if (tabName === "env") {
        document.getElementById("tab-env-btn").classList.add("active");
        document.getElementById("pane-env").classList.add("active");
    }
}

/**
 * Handles submission of POST verification test form
 */
async function handlePostSubmit(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById("submit-post-btn");
    const responseBlock = document.getElementById("post-response-block");
    
    // Elements to send
    const textVal = document.getElementById("text-input").value;
    const repeatVal = parseInt(document.getElementById("repeat-input").value) || 1;
    const reverseVal = document.getElementById("reverse-checkbox").checked;
    
    // Set loading UI
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;
    responseBlock.textContent = "Processing payload on server...";

    try {
        const response = await fetch("/api/test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: textVal,
                repeat: repeatVal,
                reverse: reverseVal
            })
        });

        if (!response.ok) throw new Error("POST request failed");
        
        const data = await response.json();
        
        // Render pretty response
        responseBlock.textContent = JSON.stringify(data, null, 4);

    } catch (error) {
        console.error("POST Form Error:", error);
        responseBlock.textContent = `Error sending request: ${error.message}`;
    } finally {
        // Reset button loading state
        submitBtn.classList.remove("loading");
        submitBtn.disabled = false;
    }
}

/**
 * Test connectivity to PostgreSQL database
 */
async function checkDatabase() {
    const btn = document.getElementById("db-test-btn");
    const desc = document.getElementById("db-status-desc");
    
    desc.textContent = "Connecting...";
    desc.style.color = "var(--text-muted)";
    
    try {
        const response = await fetch("/api/db-check");
        const data = await response.json();
        
        if (response.ok && data.status === "success") {
            desc.textContent = `Connected! ${data.database} (${data.version.split(',')[0]})`;
            desc.style.color = "var(--accent-emerald)";
        } else {
            desc.textContent = `Failed: ${data.message}`;
            desc.style.color = "var(--accent-rose)";
        }
    } catch (error) {
        console.error("Database connection check failed:", error);
        desc.textContent = "Failed: Could not reach endpoint";
        desc.style.color = "var(--accent-rose)";
    }
}

/**
 * Executes a Read/Write query test against PostgreSQL
 */
async function runDatabaseQueryTest() {
    const btn = document.getElementById("run-db-query-btn");
    const responseBlock = document.getElementById("db-query-response-block");
    
    // Set loading UI
    btn.classList.add("loading");
    btn.disabled = true;
    responseBlock.textContent = "Connecting to database & running queries...";

    try {
        const response = await fetch("/api/db-query-test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();
        
        // Render pretty response
        responseBlock.textContent = JSON.stringify(data, null, 4);

    } catch (error) {
        console.error("DB Query Test Error:", error);
        responseBlock.textContent = `Error sending request: ${error.message}`;
    } finally {
        // Reset button loading state
        btn.classList.remove("loading");
        btn.disabled = false;
    }
}
