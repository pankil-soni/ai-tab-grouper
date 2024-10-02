document.addEventListener("DOMContentLoaded", async () => {
    // UI Elements
    const groupingMethod = document.getElementById("groupingMethod");
    const manualCategoriesSection = document.getElementById("manualCategoriesSection");
    const smartRulesSection = document.getElementById("smartRulesSection");
    const manualCategories = document.getElementById("manualCategories");
    const groupButton = document.getElementById("groupButton");
    const ungroupAllButton = document.getElementById("ungroupAllButton");
    const status = document.getElementById("status");
    const loading = document.getElementById("loading");
    const tabSearch = document.getElementById("tabSearch");
    const settingsButton = document.getElementById("settingsButton");
    const settingsModal = document.getElementById("settingsModal");
    const saveTemplateButton = document.getElementById("saveTemplateButton");
    const templatesContainer = document.getElementById("templates");
    const tabStats = document.getElementById("tabStats");

    // Load saved settings and templates
    const settings = await loadSettings();
    const templates = await loadTemplates();
    updateTemplatesList();
    updateTabStats();

    // Event Listeners
    groupingMethod.addEventListener("change", () => {
        manualCategoriesSection.classList.toggle("hidden", groupingMethod.value !== "manual");
        smartRulesSection.classList.toggle("hidden", groupingMethod.value !== "smart");
    });

    tabSearch.addEventListener("input", debounce(filterTabs, 300));

    settingsButton.addEventListener("click", () => {
        settingsModal.classList.remove("hidden");
    });

    document.getElementById("closeSettings").addEventListener("click", () => {
        settingsModal.classList.add("hidden");
    });

    document.getElementById("saveSettings").addEventListener("click", async () => {
        await saveSettings({
            suspendAfter: document.getElementById("suspendAfter").value,
            enableNotifications: document.getElementById("enableNotifications").checked,
            autoGroup: document.getElementById("autoGroup").checked
        });
        settingsModal.classList.add("hidden");
    });

    saveTemplateButton.addEventListener("click", async () => {
        const name = prompt("Enter template name:");
        if (name) {
            const currentGroups = await getCurrentGroups();
            await saveTemplate(name, currentGroups);
            updateTemplatesList();
        }
    });

    groupButton.addEventListener("click", async () => {
        try {
            loading.classList.remove("hidden");
            status.textContent = "";

            const tabs = await chrome.tabs.query({ currentWindow: true });
            let groupingResult;

            switch (groupingMethod.value) {
                case "website":
                    groupingResult = await groupByWebsite(tabs);
                    break;
                case "manual":
                    if (!manualCategories.value.trim()) {
                        throw new Error("Please enter categories");
                    }
                    groupingResult = await groupByManualCategories(tabs, manualCategories.value);
                    break;
                case "auto":
                    groupingResult = await groupByAuto(tabs);
                    break;
                case "smart":
                    groupingResult = await groupBySmartRules(tabs);
                    break;
                case "activity":
                    groupingResult = await groupByActivity(tabs);
                    break;
            }

            await applyGroups(groupingResult);
            updateTabStats();
            status.textContent = "Tabs grouped successfully!";
            status.className = "text-sm text-green-600";
        } catch (error) {
            status.textContent = `Error: ${error.message}`;
            status.className = "text-sm text-red-600";
        } finally {
            loading.classList.add("hidden");
        }
    });

    ungroupAllButton.addEventListener("click", async () => {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        for (const tab of tabs) {
            if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
                await chrome.tabs.ungroup(tab.id);
            }
        }
        updateTabStats();
    });

    // Initialize keyboard shortcuts
    chrome.commands.onCommand.addListener((command) => {
        if (command === "quick-group") {
            groupButton.click();
        } else if (command === "toggle-group") {
            toggleCurrentGroup();
        }
    });

    // Auto-suspend inactive tabs
    if (settings.suspendAfter !== "never") {
        setInterval(checkInactiveTabs, 60000); // Check every minute
    }
});

// Helper Functions
async function loadSettings() {
    const defaults = {
        suspendAfter: "never",
        enableNotifications: true,
        autoGroup: false
    };
    const saved = await chrome.storage.sync.get("settings");
    return { ...defaults, ...saved.settings };
}

async function saveSettings(settings) {
    await chrome.storage.sync.set({ settings });
}

async function loadTemplates() {
    const saved = await chrome.storage.sync.get("templates");
    return saved.templates || {};
}

async function saveTemplate(name, groups) {
    const templates = await loadTemplates();
    templates[name] = groups;
    await chrome.storage.sync.set({ templates });
}

async function getCurrentGroups() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = {};
    for (const tab of tabs) {
        if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
            const group = await chrome.tabGroups.get(tab.groupId);
            if (!groups[group.title]) {
                groups[group.title] = [];
            }
            groups[group.title].push({
                url: tab.url,
                title: tab.title
            });
        }
    }
    return groups;
}

function updateTemplatesList() {
    const templates = document.getElementById("templates");
    templates.innerHTML = "";
    Object.keys(templates).forEach(name => {
        const div = document.createElement("div");
        div.className = "flex items-center justify-between p-2 hover:bg-gray-100 rounded";
        div.innerHTML = `
            <span>${name}</span>
            <div>
                <button class="text-blue-600 hover:text-blue-800 mr-2" onclick="applyTemplate('${name}')">Apply</button>
                <button class="text-red-600 hover:text-red-800" onclick="deleteTemplate('${name}')">Delete</button>
            </div>
        `;
        templates.appendChild(div);
    });
}

async function updateTabStats() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    const stats = {
        totalTabs: tabs.length,
        groupedTabs: tabs.filter(t => t.groupId !== chrome.tabs.TAB_ID_NONE).length,
        totalGroups: groups.length
    };
    
    tabStats.innerHTML = `
        <div>Total Tabs: ${stats.totalTabs}</div>
        <div>Grouped Tabs: ${stats.groupedTabs}</div>
        <div>Total Groups: ${stats.totalGroups}</div>
    `;
}

async function filterTabs(query) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const filtered = tabs.filter(tab => 
        tab.title.toLowerCase().includes(query.toLowerCase()) ||
        tab.url.toLowerCase().includes(query.toLowerCase())
    );
    
    // Highlight matching tabs
    tabs.forEach(async tab => {
        const matches = filtered.some(f => f.id === tab.id);
        await chrome.tabs.highlight({ tabs: tab.index, windowId: tab.windowId });
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function checkInactiveTabs() {
    const settings = await loadSettings();
    if (settings.suspendAfter === "never") return;

    const tabs = await chrome.tabs.query({ active: false });
    const threshold = settings.suspendAfter * 60 * 1000; // Convert minutes to milliseconds

    tabs.forEach(async tab => {
        const lastAccessed = await chrome.tabs.get(tab.id).then(t => t.lastAccessed);
        if (Date.now() - lastAccessed > threshold) {
            if (settings.enableNotifications) {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icons/icon.png",
                    title: "Tab Suspended",
                    message: `Tab "${tab.title}" has been suspended due to inactivity.`
                });
            }
            await chrome.tabs.discard(tab.id);
        }
    });
}

async function toggleCurrentGroup() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
        const group = await chrome.tabGroups.get(tab.groupId);
        await chrome.tabGroups.update(tab.groupId, { collapsed: !group.collapsed });
    }
}

// Existing grouping functions
async function groupByWebsite(tabs) {
    const groups = {};
    tabs.forEach(tab => {
        const url = new URL(tab.url);
        const domain = url.hostname;
        if (!groups[domain]) {
            groups[domain] = [];
        }
        groups[domain].push(tab.id);
    });
    return groups;
}

async function groupByManualCategories(tabs, categoriesString) {
    const categories = categoriesString.split('\n').map(c => c.trim()).filter(Boolean);
    const groups = {};
    
    for (const category of categories) {
        groups[category] = [];
    }

    for (const tab of tabs) {
        const matchingCategory = categories.find(category =>
            tab.title.toLowerCase().includes(category.toLowerCase()) ||
            tab.url.toLowerCase().includes(category.toLowerCase())
        );
        
        if (matchingCategory) {
            groups[matchingCategory].push(tab.id);
        }
    }

    return groups;
}

async function groupByAuto(tabs) {
    try {
        const response = await fetch("http://localhost:5000/group", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                tabs: tabs.map(tab => ({
                    title: tab.title,
                    url: tab.url,
                    id: tab.id
                }))
            })
        });

        if (!response.ok) {
            throw new Error("Failed to get AI grouping suggestions");
        }

        const result = await response.json();
        return result.groups;
    } catch (error) {
        console.error("Error in AI grouping:", error);
        throw error;
    }
}

async function groupBySmartRules(tabs) {
    // Implement smart rules grouping logic
    const rules = await loadSmartRules();
    const groups = {};

    tabs.forEach(tab => {
        for (const rule of rules) {
            if (matchesRule(tab, rule)) {
                if (!groups[rule.groupName]) {
                    groups[rule.groupName] = [];
                }
                groups[rule.groupName].push(tab.id);
                break;
            }
        }
    });

    return groups;
}

async function groupByActivity(tabs) {
    const groups = {
        "Active (24h)": [],
        "Recent (7d)": [],
        "Older": []
    };

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const week = 7 * day;

    tabs.forEach(tab => {
        const lastAccessed = tab.lastAccessed || now;
        const age = now - lastAccessed;

        if (age <= day) {
            groups["Active (24h)"].push(tab.id);
        } else if (age <= week) {
            groups["Recent (7d)"].push(tab.id);
        } else {
            groups["Older"].push(tab.id);
        }
    });

    return groups;
}

async function applyGroups(groups) {
    const colors = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan"];
    let colorIndex = 0;

    for (const [name, tabIds] of Object.entries(groups)) {
        if (tabIds.length > 0) {
            const groupId = await chrome.tabs.group({ tabIds });
            await chrome.tabGroups.update(groupId, {
                title: name,
                color: colors[colorIndex % colors.length]
            });
            colorIndex++;
        }
    }
}
