document.addEventListener("DOMContentLoaded", () => {
  const groupingMethod = document.getElementById("groupingMethod");
  const manualCategoriesSection = document.getElementById(
    "manualCategoriesSection"
  );
  const manualCategories = document.getElementById("manualCategories");
  const groupButton = document.getElementById("groupButton");
  const ungroupAllButton = document.getElementById("ungroupAllButton");
  const status = document.getElementById("status");
  const loading = document.getElementById("loading");

  
  groupingMethod.addEventListener("change", () => {
    manualCategoriesSection.classList.toggle(
      "hidden",
      groupingMethod.value !== "manual"
    );
  });

  groupButton.addEventListener("click", async () => {
    try {
      loading.classList.add("active");
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
          groupingResult = await groupByManualCategories(
            tabs,
            manualCategories.value
          );
          break;
        case "auto":
          groupingResult = await groupByAuto(tabs);
          break;
      }

      await applyGroups(groupingResult);
      status.textContent = "Tabs grouped successfully!";
      status.className = "mt-4 text-sm text-green-600";
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
      status.className = "mt-4 text-sm text-red-600";
    } finally {
      loading.classList.remove("active");
    }
  });

  ungroupAllButton.addEventListener("click", async () => {
    await chrome.tabs.query({ currentWindow: true }).then((tabs) => {
      tabs.forEach(async (tab) => {
        await chrome.tabs.ungroup(tab.id);
      });
    });
  });
});

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
  const categories = categoriesString.split(",").map((c) => c.trim());

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

async function applyGroups(groups) {
  for (const group of groups) {
    await chrome.tabs
      .group({
        tabIds: group.tabIds,
      })
      .then((groupId) => {
        return chrome.tabGroups.update(groupId, {
          title: group.title,
          color: group.color,
          collapsed: true,
        });
      });
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
