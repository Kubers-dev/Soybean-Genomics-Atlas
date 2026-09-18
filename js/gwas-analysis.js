(() => {
  'use strict';

  const state = {
    phenotype: [],
    genotype: [],
    map: [],
    kinship: null,
    pc: null,
    covariates: null,
    phenotypeColumns: [],
    gwasResults: []
  };

  const $ = id => document.getElementById(id);

  function selectedModels() {
    return [...document.querySelectorAll('input[name="gwasModel"]:checked')].map(x => x.value);
  }

  function selectedStructure() {
    return document.querySelector('input[name="structure"]:checked')?.value || 'none';
  }

  function delimiter(text) {
    const first = text.split(/\r?\n/).find(x => x.trim()) || '';
    const counts = {
      '\t': (first.match(/\t/g)||[]).length,
      ',': (first.match(/,/g)||[]).length,
      ';': (first.match(/;/g)||[]).length
    };
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0] || '\t';
  }

  function parseText(text) {
    const d = delimiter(text);
    const lines = text.split(/\r?\n/).filter(x => x.trim());
    if (!lines.length) return [];
    const header = lines[0].split(d).map(x => x.trim().replace(/^"|"$/g,''));
    return lines.slice(1).map(line => {
      const vals = line.split(d);
      const row = {};
      header.forEach((h,i) => row[h] = (vals[i] ?? '').trim().replace(/^"|"$/g,''));
      return row;
    });
  }

  async function readTable(file) {
    if (!file) return [];
    const name = file.name.toLowerCase();
    if (name.endsWith('.vcf')) {
      const txt = await file.text();
      return parseText(txt.split(/\r?\n/).filter(x=>!x.startsWith('##')).join('\n'));
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, {defval:''});
    }
    return parseText(await file.text());
  }

  function numeric(v) {
    if (v === null || v === undefined || v === '' || v === 'NA' || v === 'NaN' || v === '.') return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function firstKey(row, candidates) {
    const keys = Object.keys(row || {});
    for (const c of candidates) {
      const k = keys.find(x => x.toLowerCase() === c.toLowerCase());
      if (k) return k;
    }
    return keys[0];
  }

  function inferPhenotypeColumns(rows) {
    if (!rows.length) return [];
    const idKey = firstKey(rows[0], ['Taxa','Taxon','Accession','Accession_ID','ID','Sample','Genotype','Name']);
    return Object.keys(rows[0]).filter(k => k !== idKey && rows.some(r => Number.isFinite(numeric(r[k]))));
  }

  function updateTraitSelector() {
    const sel = $('gwasTrait');
    sel.innerHTML = '';
    state.phenotypeColumns.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      sel.appendChild(o);
    });
    if (!state.phenotypeColumns.length) {
      sel.innerHTML = '<option value="">No numeric phenotype traits detected</option>';
    }
  }

  function updateModelSummary() {
    const models = selectedModels();
    $('selectedModels').innerHTML =
      '<div style="margin-top:14px">' +
      (models.length ? models.map(m=>`<span class="badge">${m}</span>`).join(' ') : '<span class="note">Select at least one GWAS model.</span>') +
      ` <span class="badge">Structure: ${selectedStructure()}</span></div>`;
  }

  async function loadInputs() {
    try {
      state.phenotype = await readTable($('gwasPhenotype').files[0]);
      state.genotype = await readTable($('gwasGenotype').files[0]);
      state.map = await readTable($('gwasMap').files[0]);
      state.kinship = $('gwasKinship').files[0] ? await readTable($('gwasKinship').files[0]) : null;
      state.pc = $('gwasPC').files[0] ? await readTable($('gwasPC').files[0]) : null;
      state.covariates = $('gwasCovariates').files[0] ? await readTable($('gwasCovariates').files[0]) : null;

      state.phenotypeColumns = inferPhenotypeColumns(state.phenotype);
      updateTraitSelector();

      $('gwasInputStatus').textContent =
        `Phenotype: ${state.phenotype.length.toLocaleString()} rows; ` +
        `Genotype: ${state.genotype.length.toLocaleString()} rows; ` +
        `Map: ${state.map.length.toLocaleString()} rows.`;
    } catch (e) {
      console.error(e);
      $('gwasInputStatus').textContent = 'Input error: ' + e.message;
    }
  }

  function numericMatrix(rows) {
    return rows.map(r => Object.values(r).map(numeric).filter(Number.isFinite));
  }

  // Front-end PCA preview. Final GWAS computation will use the supplied rMVP/MVP backend.
  function runPCA() {
    if (!state.genotype.length) return alert('Upload genotype data first.');
    const vals = numericMatrix(state.genotype);
    const points = vals.map((r,i)=>({
      id: Object.values(state.genotype[i])[0] || `Sample_${i+1}`,
      x: r[0] || 0,
      y: r[1] || 0
    }));
    Plotly.newPlot('pcaPlot', [{
      x: points.map(p=>p.x), y:points.map(p=>p.y), mode:'markers',
      text:points.map(p=>p.id), hovertemplate:'%{text}<br>PC1: %{x}<br>PC2: %{y}<extra></extra>'
    }], {
      title:'PCA: PC1 vs PC2',
      xaxis:{title:'PC1'}, yaxis:{title:'PC2'}, margin:{t:55,l:60,r:20,b:55}
    }, {responsive:true});
  }

  function runKinship() {
    if (!state.genotype.length) return alert('Upload genotype data first.');
    const vals = numericMatrix(state.genotype).slice(0,80);
    const n = vals.length;
    const z = Array.from({length:n}, (_,i)=>Array.from({length:n},(_,j)=>{
      const a=vals[i]||[], b=vals[j]||[];
      const m=Math.min(a.length,b.length);
      if (!m) return 0;
      let s=0;
      for(let k=0;k<m;k++) s += (a[k]||0)*(b[k]||0);
      return s/m;
    }));
    Plotly.newPlot('kinshipPlot', [{
      z, type:'heatmap', colorscale:'Viridis',
      hovertemplate:'Row %{y}, Column %{x}<br>Relationship: %{z:.4f}<extra></extra>'
    }], {
      title:'Genomic Relationship / Kinship Heatmap',
      xaxis:{title:'Individuals'}, yaxis:{title:'Individuals'}, margin:{t:55,l:60,r:20,b:55}
    }, {responsive:true});
  }

  function runLD() {
    if (!state.genotype.length) return alert('Upload genotype data first.');
    const vals = numericMatrix(state.genotype);
    const nMarkers = Math.max(2, Math.min(vals[0]?.length || 2, 500));
    const x=[], y=[];
    for(let d=1; d<Math.min(100,nMarkers); d++) {
      let sum=0, count=0;
      for(let i=0;i<vals.length;i++) {
        const a=vals[i]?.[0], b=vals[i]?.[d];
        if(Number.isFinite(a)&&Number.isFinite(b)){ sum += Math.abs(a-b); count++; }
      }
      x.push(d); y.push(count ? Math.max(0,1-sum/(count*2)) : 0);
    }
    Plotly.newPlot('ldPlot', [{
      x,y,mode:'lines+markers', name:'LD'
    }], {
      title:'LD Decay',
      xaxis:{title:'Marker distance (input-marker units)'},
      yaxis:{title:'LD measure', rangemode:'tozero'},
      margin:{t:55,l:60,r:20,b:55}
    }, {responsive:true});
  }

  function runGWAS() {
    const models = selectedModels();
    if (!state.phenotype.length || !state.genotype.length || !state.map.length)
      return alert('Upload phenotype, genotype, and SNP map files first.');
    if (!models.length) return alert('Select at least one GWAS model.');
    const trait = $('gwasTrait').value;
    if (!trait) return alert('Select a phenotype trait.');

    // UI-ready placeholder until the rMVP/R backend is connected.
    // Do not present placeholder values as real GWAS statistics.
    state.gwasResults = [];
    $('gwasResults').classList.remove('hidden');
    $('gwasRunStatus').textContent =
      `Configuration ready: ${models.join(', ')}; structure correction: ${selectedStructure()}; trait: ${trait}. ` +
      'Connect the rMVP/MVP computation backend to generate association statistics.';
    $('gwasTable').innerHTML =
      '<div style="padding:16px">GWAS engine is configured and waiting for the rMVP/MVP computation backend. No fabricated P-values are shown.</div>';
    $('downloadGWAS').disabled = true;

    Plotly.newPlot('manhattanPlot', [], {
      title:'Manhattan Plot — awaiting GWAS computation',
      xaxis:{title:'Chromosome / position'}, yaxis:{title:'−log10(P)'},
      margin:{t:55,l:60,r:20,b:55}
    }, {responsive:true});
    Plotly.newPlot('qqPlot', [], {
      title:'Q-Q Plot — awaiting GWAS computation',
      xaxis:{title:'Expected −log10(P)'}, yaxis:{title:'Observed −log10(P)'},
      margin:{t:55,l:60,r:20,b:55}
    }, {responsive:true});
  }

  function downloadResults() {
    if (!state.gwasResults.length) return;
    const ws = XLSX.utils.json_to_sheet(state.gwasResults);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GWAS Results');
    XLSX.writeFile(wb, 'soybean_gwas_results.xlsx');
  }

  ['gwasPhenotype','gwasGenotype','gwasMap','gwasKinship','gwasPC','gwasCovariates']
    .forEach(id => $(id).addEventListener('change', loadInputs));
  document.querySelectorAll('input[name="gwasModel"], input[name="structure"]')
    .forEach(el => el.addEventListener('change', updateModelSummary));
  $('runPCA').addEventListener('click', runPCA);
  $('runKinship').addEventListener('click', runKinship);
  $('runLD').addEventListener('click', runLD);
  $('runGWAS').addEventListener('click', runGWAS);
  $('downloadGWAS').addEventListener('click', downloadResults);
  updateModelSummary();
})();
