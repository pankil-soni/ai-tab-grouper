document.addEventListener("DOMContentLoaded", async () => {
  // UI Elements
  const groupingMethod = document.getElementById("groupingMethod");
  const manualCategoriesSection = document.getElementById(
    "manualCategoriesSection"
  );
  const smartRulesSection = document.getElementById("smartRulesSection");
  const manualCategories = document.getElementById("manualCategories");
  const openButton = document.getElementById("openButton");
  const groupButton = document.getElementById("groupButton");
  const ungroupAllButton = document.getElementById("ungroupAllButton");
  const status = document.getElementById("status");
  const loading = document.getElementById("loading");
  const tabSearch = document.getElementById("tabSearch");
  const settingsButton = document.getElementById("settingsButton");
  const settingsModal = document.getElementById("settingsModal");
  const saveTemplateButton = document.getElementById("saveTemplateButton");
  const addRuleButton = document.getElementById("addRuleButton");
  const savedRulesContainer = document.getElementById("savedRules");

  let globalTemplates = {};

  // Load saved settings and templates
  let settings = await loadSettings();
  globalTemplates = await loadTemplates();

  updateTemplatesList();
  await updateTabStats();
  await displaySavedRules();

  // Event Listeners
  groupingMethod.addEventListener("change", () => {
    manualCategoriesSection.classList.toggle(
      "hidden",
      groupingMethod.value !== "manual"
    );
    smartRulesSection.classList.toggle(
      "hidden",
      groupingMethod.value !== "smart"
    );
  });

  openButton.addEventListener("click", async () => {
    const query = tabSearch.value;
    await filterTabs(query);
  });

  tabSearch.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      const query = tabSearch.value;
      await filterTabs(query);
    }
  });

  settingsButton.addEventListener("click", async () => {
    settings = await loadSettings();
    showSettingsModal(settings);
  });

  document.getElementById("closeSettings").addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });

  document
    .getElementById("saveSettings")
    .addEventListener("click", async () => {
      await saveSettings({
        suspendAfter: document.getElementById("suspendAfter").value,
        enableNotifications: document.getElementById("enableNotifications")
          .checked,
        autoGroup: document.getElementById("autoGroup").checked,
      });
      settingsModal.classList.add("hidden");
    });

  saveTemplateButton.addEventListener("click", async () => {
    const groups = await chrome.tabGroups.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });

    if (groups.length === 0) {
      alert("No groups to save");
      return;
    }

    const name = prompt("Enter template name:");
    if (name) {
      const currentGroups = await getCurrentGroups();
      await saveTemplate(name, currentGroups);
      globalTemplates = await loadTemplates();
      updateTemplatesList();
    }
  });

  groupButton.addEventListener("click", async () => {
    try {
      loading.classList.remove("hidden");
      status.textContent = "";
      status.className = "text-sm";

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
          groupingResult = await groupByManualCategories(
            tabs,
            manualCategories.value
          );
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
      await updateTabStats();
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
    await updateTabStats();
  });

  addRuleButton.addEventListener("click", async () => {
    const groupName = document.getElementById("ruleGroupName").value;
    const urlContains = document.getElementById("ruleUrlContains").value;
    const titleContains = document.getElementById("ruleTitleContains").value;

    // Validate inputs
    if (!groupName || !urlContains) {
      alert("Group Name and URL Contains fields are required.");
      return;
    }

    // Create new rule object
    const newRule = { groupName, urlContains, titleContains };

    // Load existing rules and add the new one
    const existingRules = await loadSmartRules();
    existingRules.push(newRule);

    // Save updated rules
    await saveSmartRules(existingRules);

    // Clear input fields
    document.getElementById("ruleGroupName").value = "";
    document.getElementById("ruleUrlContains").value = "";
    document.getElementById("ruleTitleContains").value = "";

    // Refresh rules display
    await displaySavedRules();
  });

  // Keyboard shortcuts (If defined in manifest)
  // NOTE: This might not work properly in popup, usually commands in background.
  try {
    chrome.commands.onCommand.addListener((command) => {
      if (command === "quick-group") {
        groupButton.click();
      } else if (command === "toggle-group") {
        toggleCurrentGroup();
      }
    });
  } catch (e) {
    // no-op
  }

  // Auto-suspend inactive tabs
  if (settings.suspendAfter !== "never") {
    setInterval(checkInactiveTabs, 60000); // Check every minute
  }

  async function deleteSmartRuleByIndex(index) {
    const rules = await loadSmartRules();
    if (index < 0 || index >= rules.length) return;
    rules.splice(index, 1);
    await saveSmartRules(rules);
    await displaySavedRules();
  }

  // Helper Functions
  async function loadSettings() {
    const defaults = {
      suspendAfter: "never",
      enableNotifications: true,
      autoGroup: false,
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

  async function applyTemplate(name) {
    const templates = await loadTemplates();
    const template = templates[name];
    if (!template) return;

    // Ungroup everything first
    const tabs = await chrome.tabs.query({ currentWindow: true });
    for (const tab of tabs) {
      if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
        await chrome.tabs.ungroup(tab.id);
      }
    }

    // apply template groups
    const currentTabs = await chrome.tabs.query({ currentWindow: true });
    for (const [groupTitle, tabInfos] of Object.entries(template)) {
      const tabIds = [];
      for (const info of tabInfos) {
        const tab = currentTabs.find((t) => t.url === info.url);
        if (tab) tabIds.push(tab.id);
      }

      if (tabIds.length > 0) {
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, {
          title: groupTitle,
          color: getRandomColor(),
          collapsed: true,
        });
      }
    }
    await updateTabStats();
  }

  async function deleteTemplate(name) {
    const templates = await loadTemplates();
    delete templates[name];
    await chrome.storage.sync.set({ templates });
    await updateTemplatesList();
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
          title: tab.title,
        });
      }
    }
    return groups;
  }

  async function updateTemplatesList() {
    const templates = await loadTemplates();
    const templatesContainer = document.getElementById("templates");
    templatesContainer.innerHTML = "";

    Object.keys(templates).forEach((name) => {
      const div = document.createElement("div");
      div.className =
        "flex items-center justify-between p-2 hover:bg-gray-100 rounded";
      div.innerHTML = `
        <span>${name}</span>
        <div>
          <button class="text-blue-600 hover:text-blue-800 mr-2" data-name="${name}" data-action="apply">Apply</button>
          <button class="text-red-600 hover:text-red-800" data-name="${name}" data-action="delete">Delete</button>
        </div>
      `;
      templatesContainer.appendChild(div);
    });

    templatesContainer
      .querySelectorAll("[data-action='apply']")
      .forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const name = e.target.getAttribute("data-name");
          await applyTemplate(name);
        });
      });

    templatesContainer
      .querySelectorAll("[data-action='delete']")
      .forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const name = e.target.getAttribute("data-name");
          await deleteTemplate(name);
        });
      });
  }

  async function updateTabStats() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const groups = await chrome.tabGroups.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    const stats = {
      totalTabs: tabs.length,
      groupedTabs: tabs.filter((t) => t.groupId !== chrome.tabs.TAB_ID_NONE)
        .length,
      totalGroups: groups.length,
    };

    const tabStats = document.getElementById("tabStats");
    tabStats.innerHTML = `
      <div>Total Tabs: ${stats.totalTabs}</div>
      <div>Grouped Tabs: ${stats.groupedTabs}</div>
      <div>Total Groups: ${stats.totalGroups}</div>
    `;
  }

  async function filterTabs(query) {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const lowerQuery = query.toLowerCase();
    const filtered = tabs.filter(
      (tab) =>
        (tab.title && tab.title.toLowerCase().includes(lowerQuery)) ||
        (tab.url && tab.url.toLowerCase().includes(lowerQuery))
    );

    if (filtered.length > 0) {
      const indices = filtered.map((t) => t.index);
      await chrome.tabs.highlight({
        tabs: indices,
        windowId: filtered[0].windowId,
      });
    }
  }

  async function checkInactiveTabs() {
    const settings = await loadSettings();
    if (settings.suspendAfter === "never") return;

    const tabs = await chrome.tabs.query({
      active: false,
      currentWindow: true,
    });
    const threshold = parseInt(settings.suspendAfter, 10) * 60 * 1000; // Convert minutes to ms

    for (const tab of tabs) {
      const lastAccessed = tab.lastAccessed || Date.now();
      if (Date.now() - lastAccessed > threshold) {
        if (settings.enableNotifications) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon.png",
            title: "Tab Suspended",
            message: `Tab "${tab.title}" has been suspended due to inactivity.`,
          });
        }
        await chrome.tabs.discard(tab.id);
      }
    }
  }

  async function toggleCurrentGroup() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab.groupId !== chrome.tabs.TAB_ID_NONE) {
      const group = await chrome.tabGroups.get(tab.groupId);
      await chrome.tabGroups.update(tab.groupId, {
        collapsed: !group.collapsed,
      });
    }
  }

  async function groupByWebsite(tabs) {
    const groups = {};
    tabs.forEach((tab) => {
      const url = new URL(tab.url);
      const domain = url.hostname;
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push(tab.id);
    });

    return Object.entries(groups).map(([domain, tabIds]) => ({
      title: domain,
      tabIds,
      color: getRandomColor(),
    }));
  }

  async function groupByManualCategories(tabs, categoriesString) {
    const categories = categoriesString
      .split("\n")
      .map((c) => c.trim())
      .filter((c) => c);

    const response = await fetch("http://localhost:5000/group-tabs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tabs: tabs.map((tab) => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
        })),
        categories,
        mode: "manual",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to group tabs");
    }

    return await response.json();
  }

  async function groupByAuto(tabs) {
    const response = await fetch("http://localhost:5000/group-tabs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tabs: tabs.map((tab) => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
        })),
        mode: "auto",
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to group tabs");
    }

    return await response.json();
  }

  async function groupBySmartRules(tabs) {
    const rules = await loadSmartRules();
    const groups = {};

    tabs.forEach((tab) => {
      let assigned = false;
      for (const rule of rules) {
        if (matchesRule(tab, rule)) {
          if (!groups[rule.groupName]) {
            groups[rule.groupName] = [];
          }
          groups[rule.groupName].push(tab.id);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        if (!groups["Uncategorized"]) {
          groups["Uncategorized"] = [];
        }
        groups["Uncategorized"].push(tab.id);
      }
    });

    return Object.entries(groups).map(([title, tabIds]) => ({
      title,
      tabIds,
      color: getRandomColor(),
    }));
  }

  async function loadSmartRules() {
    const saved = await chrome.storage.sync.get("smartRules");
    // If none saved, return a default set
    return saved.smartRules || [];
  }

  async function saveSmartRules(rules) {
    await chrome.storage.sync.set({ smartRules: rules });
  }

  function matchesRule(tab, rule) {
    const url = (tab.url || "").toLowerCase();
    const title = (tab.title || "").toLowerCase();

    let match = true;
    if (rule.urlContains && !url.includes(rule.urlContains.toLowerCase())) {
      match = false;
    }
    if (
      rule.titleContains &&
      !title.includes(rule.titleContains.toLowerCase())
    ) {
      match = false;
    }

    return match;
  }

  async function groupByActivity(tabs) {
    const groups = {
      "Active (1h)": [],
      "Active (24h)": [],
      "Recent (7d)": [],
      Older: [],
    };

    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    const week = 7 * day;

    tabs.forEach((tab) => {
      const lastAccessed = tab.lastAccessed || now;
      const age = now - lastAccessed;
      if (age <= hour) {
        groups["Active (1h)"].push(tab.id);
      } else if (age <= day) {
        groups["Active (24h)"].push(tab.id);
      } else if (age <= week) {
        groups["Recent (7d)"].push(tab.id);
      } else {
        groups["Older"].push(tab.id);
      }
    });

    return Object.entries(groups).map(([title, tabIds]) => ({
      title,
      tabIds,
      color: getRandomColor(),
    }));
  }

  async function applyGroups(groups) {
    for (const group of groups) {
      if (group.tabIds && group.tabIds.length > 0) {
        const groupId = await chrome.tabs.group({
          tabIds: group.tabIds,
        });
        await chrome.tabGroups.update(groupId, {
          title: group.title,
          color: group.color,
          collapsed: true,
        });
      }
    }
  }

  function getRandomColor() {
    const colors = [
      "grey",
      "blue",
      "red",
      "yellow",
      "green",
      "pink",
      "purple",
      "cyan",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function showSettingsModal(settings) {
    document.getElementById("suspendAfter").value = settings.suspendAfter;
    document.getElementById("enableNotifications").checked =
      settings.enableNotifications;
    document.getElementById("autoGroup").checked = settings.autoGroup;
    document.getElementById("settingsModal").classList.remove("hidden");
  }

  async function displaySavedRules() {
    const rules = await loadSmartRules();
    savedRulesContainer.innerHTML = "";

    if (rules.length === 0) {
      const p = document.createElement("p");
      p.textContent = "No custom rules added yet.";
      savedRulesContainer.appendChild(p);
    } else {
      rules.forEach((rule, index) => {
        const ruleElement = document.createElement("div");
        ruleElement.className = "rule-item p-2 border rounded-lg bg-gray-100";
        ruleElement.innerHTML = `<strong>${
          rule.groupName
        }</strong> - URL Contains: ${rule.urlContains}${
          rule.titleContains ? ` - Title Contains: ${rule.titleContains}` : ""
        } 
        <button class="text-red-600 hover:text-red-800 delete-rule" data-index="${index}">Delete</button>`;
        savedRulesContainer.appendChild(ruleElement);

        const deleteButton = ruleElement.querySelector(".delete-rule");
        deleteButton.addEventListener("click", async () => {
          await deleteSmartRuleByIndex(index);
        });
      });
    }
  }
});
