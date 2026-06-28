const project = window.__PROJECT_DEMO__;
const state = { view: "overview", selected: project.records[0]?.id || "", query: "" };

function html(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function nav() {
  return ["overview", "workflow", "data", "visualization", "evidence", "architecture"].map((view) =>
    `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${view}</button>`
  ).join("");
}

function metric(label, value) {
  return `<div class="metric"><span>${html(label)}</span><strong>${html(value)}</strong></div>`;
}

function overview() {
  return `
    <section class="hero panel">
      <div>
        <p class="eyebrow">${html(project.category)} · ${html(project.year)}</p>
        <h1>${html(project.title)}</h1>
        <p class="lead">${html(project.summary)}</p>
      </div>
      <div class="metrics">
        ${metric("Workflow steps", project.features.length)}
        ${metric("Sample records", project.records.length)}
        ${metric("Tech tags", project.technologies.length)}
        ${metric("Status", project.status)}
      </div>
    </section>
    <section class="split">
      <article class="panel"><h2>Problem</h2><p>${html(project.problem)}</p></article>
      <article class="panel"><h2>Implemented Demo</h2><p>${html(project.solution)}</p></article>
    </section>
  `;
}

function workflow() {
  return `
    <section class="panel">
      <div class="section-head">
        <div><p class="eyebrow">guided workflow</p><h2>Executable Review Flow</h2></div>
        <button class="primary" id="runDemo">Run demo pass</button>
      </div>
      <div class="board">
        ${project.features.map((feature, index) => `
          <button class="step ${index === 0 ? "selected" : ""}" data-feature="${index}">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <strong>${html(feature)}</strong>
            <em>${index % 2 === 0 ? "Ready" : "Review"}</em>
          </button>
        `).join("")}
      </div>
      <output id="demoOutput">Ready to execute a deterministic project walkthrough.</output>
    </section>
  `;
}

function data() {
  const rows = project.records.filter((record) => !state.query || [record.id, record.name, record.owner, record.status].join(" ").toLowerCase().includes(state.query.toLowerCase()));
  return `
    <section class="panel">
      <div class="section-head">
        <div><p class="eyebrow">fixture data</p><h2>Sample Records</h2></div>
        <input id="search" value="${html(state.query)}" placeholder="Filter records" />
      </div>
      <div class="table">
        ${rows.map((record) => `
          <button class="row ${state.selected === record.id ? "selected" : ""}" data-record="${html(record.id)}">
            <span>${html(record.id)}</span>
            <strong>${html(record.name)}</strong>
            <em>${html(record.owner)}</em>
            <b>${html(record.status)}</b>
          </button>
        `).join("") || `<p class="empty">No matching records.</p>`}
      </div>
    </section>
  `;
}

function visualization() {
  const max = Math.max(...project.records.map((record) => record.score), 1);
  return `
    <section class="panel">
      <div class="section-head">
        <div><p class="eyebrow">visible output</p><h2>Demo Result Visualization</h2></div>
        <span class="badge">Fixture-backed</span>
      </div>
      <div class="viz">
        ${project.records.map((record) => `
          <div class="bar-row">
            <span>${html(record.id)}</span>
            <div class="bar-track"><div class="bar-fill" style="width: ${Math.round(record.score / max * 100)}%"></div></div>
            <strong>${record.score}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function evidence() {
  return `
    <section class="split">
      <article class="panel">
        <p class="eyebrow">repository evidence</p>
        <h2>Project Modules</h2>
        <div class="chips">${(project.modules.length ? project.modules : ["README.md", "demo-app/"]).map((item) => `<span>${html(item)}</span>`).join("")}</div>
      </article>
      <article class="panel">
        <p class="eyebrow">technology</p>
        <h2>Tech Stack</h2>
        <div class="chips">${(project.technologies.length ? project.technologies : ["Static HTML", "JavaScript", "GitHub Pages"]).map((item) => `<span>${html(item)}</span>`).join("")}</div>
      </article>
    </section>
  `;
}

function architecture() {
  return `
    <section class="panel">
      <p class="eyebrow">architecture</p>
      <h2>Static Demo Architecture</h2>
      <p>${html(project.architecture)}</p>
      <pre>demo-app/
  index.html
  styles.css
  main.js

${html(project.setupGuide)}</pre>
    </section>
  `;
}

function render() {
  const views = { overview, workflow, data, visualization, evidence, architecture };
  document.querySelector("#app").innerHTML = `
    <header>
      <a class="brand" href="${html(project.repoUrl)}">${html(project.title)}</a>
      <nav>${nav()}</nav>
      <a class="readme" href="${html(project.readmeUrl)}">README</a>
    </header>
    <main>${views[state.view]()}</main>
  `;
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    render();
  }));
  document.querySelector("#runDemo")?.addEventListener("click", () => {
    document.querySelector("#demoOutput").textContent = `${project.title}: ${project.records.length} records processed across ${project.features.length} workflow checks.`;
  });
  document.querySelector("#search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
    document.querySelector("#search")?.focus();
  });
  document.querySelectorAll("[data-record]").forEach((button) => button.addEventListener("click", () => {
    state.selected = button.dataset.record;
    render();
  }));
}

render();
