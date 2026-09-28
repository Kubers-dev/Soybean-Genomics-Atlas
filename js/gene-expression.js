/* Soybean Genomics Atlas — isolated Gene Expression module.
 * No phenotype/GWAS code is imported or modified.
 *
 * RNA-seq expression data:
 *   - TPM
 *   - log2(TPM + 1)
 *   - validated gene-wise Z-score
 *
 * Tissue and root-hair datasets use the compact JSON representation.
 * Root-hair reference remains on the existing legacy JSON representation.
 */
(() => {
  'use strict';

  const DATA = {
    tissue: 'data/expression_atlas/rnaseq_compact/study2_tissue_expression_rnaseq.json',
    root_hair: 'data/expression_atlas/rnaseq_compact/study1_root_hair_expression_rnaseq.json',
    root_hair_reference: 'data/expression_atlas/study2_root_hair_reference.json'
  };

  const META = {
    tissue: {
      title: 'Tissue Expression',
      conditions: ['Nodule','SAM','Flower','Green Pod','Leaf','Root','Root Tip']
    },
    root_hair: {
      title: 'Root Hair Series',
      conditions: [
        '12HAI UN RH',
        '12HAI IN RH',
        '24HAI UN RH',
        '24HAI IN RH',
        '48HAI UN RH',
        '48HAI IN RH',
        '48HAI Stripped Root'
      ]
    },
    root_hair_reference: {
      title: 'Root Hair Reference',
      conditions: ['Root hair 84HAS','Root hair 120HAS']
    }
  };

  const state = {
    datasets: {},
    genes: [],
    series: 'tissue',
    transform: 'raw',
    single: null
  };

  const $ = id => document.getElementById(id);

  const esc = s =>
    String(s ?? '').replace(
      /[&<>"']/g,
      c => ({
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;'
      }[c])
    );

  function parseIds(text) {
    return [
      ...new Set(
        text
          .split(/[\s,;]+/)
          .map(x => x.trim())
          .filter(Boolean)
      )
    ];
  }

  async function loadDataset(series) {
    if (state.datasets[series]) return state.datasets[series];

    const res = await fetch(DATA[series], {
      cache: 'force-cache'
    });

    if (!res.ok) {
      throw new Error(
        `Expression dataset could not be loaded (${res.status}).`
      );
    }

    const data = await res.json();

    state.datasets[series] = data;
    return data;
  }

  function normalizeId(x) {
    return String(x || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  /*
   * Compact RNA-seq datasets:
   *
   *   data.byAlias[alias] = record index
   *   data.records[index] = record
   *
   * Legacy root-hair reference dataset:
   *
   *   data.byAlias[alias] = record object
   */
  function lookupGenes(data, ids) {
    const byAlias = data.byAlias || {};
    const records = data.records || [];

    const found = [];
    const missing = [];

    ids.forEach(input => {
      const key = normalizeId(input);

      if (!(key in byAlias)) {
        missing.push(input);
        return;
      }

      const ref = byAlias[key];

      let rec = null;

      if (Number.isInteger(ref)) {
        rec = records[ref] || null;
      } else if (ref && typeof ref === 'object') {
        rec = ref;
      }

      if (rec) {
        found.push(rec);
      } else {
        missing.push(input);
      }
    });

    const seen = new Set();

    return {
      found: found.filter(r => {
        const k = r.a6 || r.libault;

        if (seen.has(k)) return false;

        seen.add(k);
        return true;
      }),
      missing
    };
  }

  /*
   * Return the expression vector for a record.
   *
   * Compact RNA-seq records store arrays:
   *   tpm
   *   log2tpm
   *   zscore
   *
   * Legacy records store:
   *   values: { condition: value }
   */
  function getExpressionValues(data, rec, mode) {
    const conditions =
      data.conditions ||
      META[state.series].conditions;

    /*
     * Compact RNA-seq representation.
     */
    if (Array.isArray(rec[mode])) {
      const arr = rec[mode];

      return conditions.map((condition, i) => {
        const value = arr[i];

        return Number.isFinite(value)
          ? Number(value)
          : null;
      });
    }

    /*
     * Legacy representation.
     */
    if (rec.values && typeof rec.values === 'object') {
      return conditions.map(condition => {
        const value = rec.values[condition];

        return Number.isFinite(Number(value))
          ? Number(value)
          : null;
      });
    }

    return conditions.map(() => null);
  }

  /*
   * The HTML labels are retained for compatibility:
   *
   * raw     -> validated TPM
   * log1p   -> validated log2(TPM + 1)
   * zscore  -> validated gene-wise Z-score
   */
  function expressionMode() {
    if (state.transform === 'raw') return 'tpm';
    if (state.transform === 'log1p') return 'log2tpm';
    if (state.transform === 'zscore') return 'zscore';

    return 'tpm';
  }

  function getValues(data, rec) {
    return getExpressionValues(
      data,
      rec,
      expressionMode()
    );
  }

  function finiteValues(values) {
    return values.filter(v => Number.isFinite(v));
  }

  function color(value, min, max) {
    if (!Number.isFinite(value)) return '#eeeeee';

    const t =
      max === min
        ? .5
        : Math.max(
            0,
            Math.min(1, (value - min) / (max - min))
          );

    // restrained scientific blue -> warm yellow -> red scale
    const stops = [
      [0,[245,245,245]],
      [.2,[215,235,245]],
      [.45,[112,173,209]],
      [.7,[247,206,92]],
      [1,[180,35,35]]
    ];

    let a = stops[0];
    let b = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
      if (
        t >= stops[i][0] &&
        t <= stops[i + 1][0]
      ) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }

    const q =
      (t - a[0]) /
      (b[0] - a[0] || 1);

    const rgb = a[1].map(
      (x, i) =>
        Math.round(
          x + (b[1][i] - x) * q
        )
    );

    return `rgb(${rgb.join(',')})`;
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');

    a.href = URL.createObjectURL(blob);
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(
      () => URL.revokeObjectURL(a.href),
      1000
    );
  }

  function downloadText(
    text,
    filename,
    type = 'text/plain'
  ) {
    downloadBlob(
      new Blob([text], {type}),
      filename
    );
  }

  function svgToPng(svgEl, filename) {
    const serializer = new XMLSerializer();
    const svg = serializer.serializeToString(svgEl);

    const blob = new Blob(
      [svg],
      {type:'image/svg+xml;charset=utf-8'}
    );

    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas =
        document.createElement('canvas');

      const scale = 2;

      canvas.width =
        (svgEl.viewBox.baseVal.width || 1200) *
        scale;

      canvas.height =
        (svgEl.viewBox.baseVal.height || 800) *
        scale;

      const ctx =
        canvas.getContext('2d');

      ctx.fillStyle = '#fff';
      ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.drawImage(
        img,
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob(
        b => downloadBlob(b, filename),
        'image/png'
      );

      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  function drawEfp(rec) {
    const data = state.datasets[state.series];
    const conditions = META[state.series].conditions;
    const vals = getValues(data, rec);

    /*
     * For the single-gene eFP view we display both validated datasets:
     *
     *   Tissue:
     *     Nodule, SAM, Flower, Green Pod, Leaf, Root, Root Tip
     *
     *   Root hair:
     *     12HAI UN RH
     *     12HAI IN RH
     *     24HAI UN RH
     *     24HAI IN RH
     *     48HAI UN RH
     *     48HAI IN RH
     *     48HAI Stripped Root
     *
     * The datasets remain separate; this is only a combined visualization.
     */

    const tissueData =
      state.datasets.tissue || null;

    const rootHairData =
      state.datasets.root_hair || null;

    const findMatchingRecord = dataset => {
      if (!dataset || !rec) return null;

      const aliases = [
        rec.a6,
        rec.a4,
        rec.libault
      ]
        .filter(Boolean)
        .map(normalizeId);

      for (const alias of aliases) {
        const result = lookupGenes(dataset, [alias]);

        if (result.found.length) {
          return result.found[0];
        }
      }

      return null;
    };

    const tissueRec =
      state.series === 'tissue'
        ? rec
        : findMatchingRecord(tissueData);

    const rootHairRec =
      state.series === 'root_hair'
        ? rec
        : findMatchingRecord(rootHairData);

    const tissueConditions =
      META.tissue.conditions;

    const rootHairConditions =
      META.root_hair.conditions;

    const tissueVals =
      tissueRec && tissueData
        ? getValues(tissueData, tissueRec)
        : [];

    const rootHairVals =
      rootHairRec && rootHairData
        ? getValues(rootHairData, rootHairRec)
        : [];

    const allValues = [
      ...tissueVals,
      ...rootHairVals
    ].filter(Number.isFinite);

    const maxValue =
      allValues.length
        ? Math.max(...allValues)
        : 1;

    const minValue = 0;

    /*
     * Publication-style expression colors.
     * TPM/log2 values use a yellow → orange → red scale.
     * Z-score uses a centered blue → white → red scale.
     */
    const expressionColor = value => {
      if (!Number.isFinite(value)) return '#eeeeee';

      if (state.transform === 'zscore') {
        const absMax =
          Math.max(
            Math.abs(Math.min(...allValues)),
            Math.abs(Math.max(...allValues)),
            1
          );

        const t =
          Math.max(
            -1,
            Math.min(1, value / absMax)
          );

        if (t < 0) {
          const q = t + 1;
          const r = Math.round(255 * q);
          const g = Math.round(255 * q);
          const b = 255;

          return `rgb(${r},${g},${b})`;
        }

        const q = 1 - t;
        const r = 255;
        const g = Math.round(255 * q);
        const b = Math.round(255 * q);

        return `rgb(${r},${g},${b})`;
      }

      if (value <= 0) {
        return '#eeeeee';
      }

      const t =
        Math.max(
          0,
          Math.min(
            1,
            Math.log1p(value) /
            Math.log1p(Math.max(maxValue, 1))
          )
        );

      const r =
        Math.round(255);

      const g =
        Math.round(245 - 210 * t);

      const b =
        Math.round(120 - 120 * t);

      return `rgb(${r},${g},${b})`;
    };

    const tissueValue = name => {
      const i = tissueConditions.indexOf(name);
      return i >= 0 && Number.isFinite(tissueVals[i])
        ? tissueVals[i]
        : null;
    };

    const rootHairValue = name => {
      const i = rootHairConditions.indexOf(name);
      return i >= 0 && Number.isFinite(rootHairVals[i])
        ? rootHairVals[i]
        : null;
    };

    const fmt = value =>
      Number.isFinite(value)
        ? Number(value).toFixed(3)
        : 'NA';

    const labelForValue = value => {
      if (!Number.isFinite(value)) return 'NA';

      return `${fmt(value)} ${expressionMode() === 'tpm'
        ? 'TPM'
        : expressionMode() === 'log2tpm'
          ? 'log₂(TPM + 1)'
          : 'Z-score'}`;
    };

    const escAttr = s =>
      esc(s);

    /*
     * Tissue geometry.
     *
     * These are intentionally simple scientific schematic drawings,
     * matching the eFP-browser concept rather than photorealistic art.
     */

    const tissueShape = (name, value) => {
      const fill = expressionColor(value);

      if (name === 'Flower') {
        return `
          <g>
            <circle cx="500" cy="125" r="38"
                    fill="${fill}" stroke="#333" stroke-width="2"/>
            <circle cx="472" cy="100" r="28"
                    fill="${fill}" stroke="#333" stroke-width="2"/>
            <circle cx="528" cy="100" r="28"
                    fill="${fill}" stroke="#333" stroke-width="2"/>
            <circle cx="478" cy="145" r="28"
                    fill="${fill}" stroke="#333" stroke-width="2"/>
            <circle cx="522" cy="145" r="28"
                    fill="${fill}" stroke="#333" stroke-width="2"/>
            <circle cx="500" cy="122" r="12"
                    fill="#f5c542" stroke="#333"/>
          </g>`;
      }

      if (name === 'Leaf') {
        return `
          <g>
            <ellipse cx="335" cy="225"
                     rx="70" ry="32"
                     transform="rotate(-25 335 225)"
                     fill="${fill}"
                     stroke="#333"
                     stroke-width="2"/>
            <line x1="282" y1="245"
                  x2="388" y2="205"
                  stroke="#555"
                  stroke-width="2"/>
          </g>`;
      }

      if (name === 'Green Pod') {
        return `
          <g>
            <path d="M610 180
                     C650 145 720 150 745 190
                     C720 230 650 240 610 205 Z"
                  fill="${fill}"
                  stroke="#333"
                  stroke-width="2"/>
            <circle cx="650" cy="190" r="7"
                    fill="#777"/>
            <circle cx="680" cy="190" r="7"
                    fill="#777"/>
            <circle cx="710" cy="190" r="7"
                    fill="#777"/>
          </g>`;
      }

      if (name === 'SAM') {
        return `
          <path d="M470 270
                   Q500 215 530 270 Z"
                fill="${fill}"
                stroke="#333"
                stroke-width="2"/>`;
      }

      if (name === 'Root') {
        return `
          <g fill="none"
             stroke="${fill}"
             stroke-width="12"
             stroke-linecap="round">
            <path d="M500 385
                     C485 430 470 470 450 530"/>
            <path d="M500 385
                     C515 430 530 475 550 530"/>
            <path d="M500 385
                     L500 545"/>
            <path d="M470 470
                     C430 475 410 495 390 515"
                  stroke-width="5"/>
            <path d="M530 470
                     C570 475 590 495 610 515"
                  stroke-width="5"/>
          </g>`;
      }

      if (name === 'Root Tip') {
        return `
          <path d="M660 420
                   Q700 400 740 420
                   L730 485
                   Q700 515 670 485 Z"
                fill="${fill}"
                stroke="#333"
                stroke-width="2"/>`;
      }

      if (name === 'Nodule') {
        return `
          <g>
            <circle cx="360" cy="500" r="25"
                    fill="${fill}"
                    stroke="#333"
                    stroke-width="2"/>
            <circle cx="340" cy="525" r="17"
                    fill="${fill}"
                    stroke="#333"
                    stroke-width="2"/>
            <circle cx="380" cy="525" r="17"
                    fill="${fill}"
                    stroke="#333"
                    stroke-width="2"/>
          </g>`;
      }

      return '';
    };

    const tissueLabel = (name, x, y, anchor = 'start') => {
      const value = tissueValue(name);

      return `
        <line x1="${x-18}" y1="${y-6}"
              x2="${x-2}" y2="${y-6}"
              stroke="#555"
              stroke-width="1.5"/>
        <text x="${x}" y="${y-9}"
              text-anchor="${anchor}"
              font-family="Arial, Helvetica, sans-serif"
              font-size="15"
              font-weight="600"
              fill="#222">${escAttr(name)}</text>
        <text x="${x}" y="${y+11}"
              text-anchor="${anchor}"
              font-family="Arial, Helvetica, sans-serif"
              font-size="13"
              fill="#555">${escAttr(labelForValue(value))}</text>`;
    };

    let svg = `
      <svg class="efp-svg"
           id="efpSvg"
           viewBox="0 0 1200 760"
           xmlns="http://www.w3.org/2000/svg">

        <rect width="1200" height="760" fill="#fff"/>

        <!-- Header -->
        <text x="40" y="42"
              font-family="Arial, Helvetica, sans-serif"
              font-size="28"
              font-weight="700"
              fill="#172b3a">
          Soybean eFP Browser
        </text>

        <text x="40" y="72"
              font-family="Arial, Helvetica, sans-serif"
              font-size="20"
              font-weight="600"
              fill="#222">
          ${escAttr(rec.a6 || rec.libault)}
        </text>

        <text x="300" y="72"
              font-family="Arial, Helvetica, sans-serif"
              font-size="14"
              fill="#666">
          ${escAttr(
            [
              rec.a4,
              rec.libault
            ].filter(Boolean).join('  |  ')
          )}
        </text>

        <text x="1160" y="42"
              text-anchor="end"
              font-family="Arial, Helvetica, sans-serif"
              font-size="14"
              fill="#666">
          Libault et al. RNA-seq
        </text>

        <!-- Legend -->
        <text x="40" y="125"
              font-family="Arial, Helvetica, sans-serif"
              font-size="16"
              font-weight="700"
              fill="#222">
          Expression level
        </text>

        <text x="40" y="145"
              font-family="Arial, Helvetica, sans-serif"
              font-size="13"
              fill="#555">
          ${escAttr(expressionMode() === 'tpm'
            ? 'TPM'
            : expressionMode() === 'log2tpm'
              ? 'log₂(TPM + 1)'
              : 'Gene-wise Z-score')}
        </text>
    `;

    const legendX = 40;
    const legendY = 165;
    const legendH = 250;
    const steps = 30;

    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const v =
        minValue +
        (maxValue - minValue) * (1 - t);

      svg += `
        <rect x="${legendX}"
              y="${legendY + i * (legendH / steps)}"
              width="28"
              height="${legendH / steps + 1}"
              fill="${expressionColor(v)}"
              stroke="none"/>`;
    }

    svg += `
      <rect x="${legendX}"
            y="${legendY}"
            width="28"
            height="${legendH}"
            fill="none"
            stroke="#999"/>

      <text x="78" y="${legendY+8}"
            font-family="Arial"
            font-size="12"
            fill="#333">${fmt(maxValue)}</text>

      <text x="78" y="${legendY+legendH}"
            font-family="Arial"
            font-size="12"
            fill="#333">0</text>

      <rect x="${legendX}"
            y="${legendY+legendH+18}"
            width="28"
            height="20"
            fill="#eeeeee"
            stroke="#999"/>

      <text x="78"
            y="${legendY+legendH+33}"
            font-family="Arial"
            font-size="12"
            fill="#555">
        Missing
      </text>
    `;

    /*
     * Central soybean schematic.
     */

    svg += `
      <!-- Main stem -->
      <path d="M500 350
               C500 300 500 245 500 180
               C500 150 500 130 500 115"
            fill="none"
            stroke="#555"
            stroke-width="8"
            stroke-linecap="round"/>

      <!-- branches -->
      <path d="M500 235
               C450 220 405 195 365 165"
            fill="none"
            stroke="#555"
            stroke-width="5"/>

      <path d="M500 285
               C555 260 590 225 625 190"
            fill="none"
            stroke="#555"
            stroke-width="5"/>

      <!-- roots -->
      <path d="M500 345
               C480 405 455 455 425 525
               M500 345
               C520 405 545 460 575 525
               M500 345
               L500 535"
            fill="none"
            stroke="#777"
            stroke-width="5"
            stroke-linecap="round"/>

      ${tissueShape('Flower', tissueValue('Flower'))}
      ${tissueShape('Leaf', tissueValue('Leaf'))}
      ${tissueShape('Green Pod', tissueValue('Green Pod'))}
      ${tissueShape('SAM', tissueValue('SAM'))}
      ${tissueShape('Root', tissueValue('Root'))}
      ${tissueShape('Root Tip', tissueValue('Root Tip'))}
      ${tissueShape('Nodule', tissueValue('Nodule'))}

      ${tissueLabel('Flower', 555, 115)}
      ${tissueLabel('Leaf', 390, 205)}
      ${tissueLabel('Green Pod', 760, 190)}
      ${tissueLabel('SAM', 545, 275)}
      ${tissueLabel('Root', 600, 485)}
      ${tissueLabel('Root Tip', 760, 455)}
      ${tissueLabel('Nodule', 250, 515)}
    `;

    /*
     * Root-hair eFP panels.
     */
    const rhX1 = 850;
    const rhX2 = 1040;

    svg += `
      <text x="850" y="105"
            font-family="Arial"
            font-size="18"
            font-weight="700"
            fill="#222">
        Root Hair Expression
      </text>
    `;

    const rhRows = [
      ['12HAI UN RH', '12HAI IN RH'],
      ['24HAI UN RH', '24HAI IN RH'],
      ['48HAI UN RH', '48HAI IN RH'],
      ['48HAI Stripped Root', null]
    ];

    rhRows.forEach((pair, row) => {
      const y = 145 + row * 105;

      pair.forEach((condition, col) => {
        if (!condition) return;

        const x = col === 0 ? rhX1 : rhX2;
        const value = rootHairValue(condition);
        const fill = expressionColor(value);

        svg += `
          <text x="${x}" y="${y}"
                font-family="Arial"
                font-size="12"
                font-weight="600"
                fill="#333">
            ${escAttr(condition)}
          </text>

          <line x1="${x+115}" y1="${y+12}"
                x2="${x+115}" y2="${y+76}"
                stroke="#444"
                stroke-width="2"/>

          <path d="M${x+115} ${y+18}
                   C${x+65} ${y+28},
                    ${x+65} ${y+45},
                    ${x+115} ${y+50}"
                fill="${fill}"
                stroke="#444"
                stroke-width="1"/>

          <path d="M${x+115} ${y+40}
                   C${x+65} ${y+50},
                    ${x+65} ${y+67},
                    ${x+115} ${y+72}"
                fill="${fill}"
                stroke="#444"
                stroke-width="1"/>

          <text x="${x+125}" y="${y+45}"
                font-family="Arial"
                font-size="11"
                fill="#555">
            ${escAttr(labelForValue(value))}
          </text>
        `;
      });
    });

    svg += `</svg>`;

    /*
     * Exact expression table.
     */
    const tableConditions = [
      ...tissueConditions,
      ...rootHairConditions
    ];

    const tableValues = [
      ...tissueVals,
      ...rootHairVals
    ];

    let table = `
      <div class="efp-value-table-wrap">
        <div class="efp-value-table-title">
          Expression Values for ${esc(rec.a6 || rec.libault)}
        </div>
        <table class="efp-value-table">
          <thead>
            <tr>
              <th>Tissue / Condition</th>
              <th>TPM</th>
              <th>log₂(TPM + 1)</th>
              <th>Z-score</th>
            </tr>
          </thead>
          <tbody>
    `;

    const tissueZ =
      tissueRec?.zscore || [];

    const rootHairZ =
      rootHairRec?.zscore || [];

    const tissueLog2 =
      tissueRec?.log2tpm || [];

    const rootHairLog2 =
      rootHairRec?.log2tpm || [];

    tableConditions.forEach((condition, i) => {
      let value = tableValues[i];
      let log2value = null;
      let z = null;

      if (i < tissueConditions.length) {
        log2value = tissueLog2[i];
        z = tissueZ[i];
      } else {
        const j =
          i - tissueConditions.length;

        log2value = rootHairLog2[j];
        z = rootHairZ[j];
      }

      table += `
        <tr>
          <td>${esc(condition)}</td>
          <td>${Number.isFinite(value) ? fmt(value) : 'NA'}</td>
          <td>${Number.isFinite(log2value) ? fmt(log2value) : 'NA'}</td>
          <td>${Number.isFinite(z) ? fmt(z) : 'NA'}</td>
        </tr>`;
    });

    table += `
          </tbody>
        </table>
      </div>
    `;

    $('efpSvgWrap').innerHTML = `
      <div class="efp-browser-view">
        ${svg}
        ${table}
      </div>
    `;
  }

  function polar(cx,cy,r,angle) {
    const a = angle - Math.PI / 2;

    return [
      cx + r * Math.cos(a),
      cy + r * Math.sin(a)
    ];
  }

  function arcPath(cx,cy,r0,r1,a0,a1) {
    const p1 = polar(cx,cy,r1,a0);
    const p2 = polar(cx,cy,r1,a1);
    const p3 = polar(cx,cy,r0,a1);
    const p4 = polar(cx,cy,r0,a0);

    const large =
      a1 - a0 > Math.PI
        ? 1
        : 0;

    return `M${p1[0]} ${p1[1]} A${r1} ${r1} 0 ${large} 1 ${p2[0]} ${p2[1]} L${p3[0]} ${p3[1]} A${r0} ${r0} 0 ${large} 0 ${p4[0]} ${p4[1]} Z`;
  }

  function heatmapColor(value, min, max) {
    if (!Number.isFinite(value)) return '#eeeeee';

    if (state.transform === 'zscore') {
      const absMax = Math.max(
        Math.abs(min),
        Math.abs(max),
        1e-12
      );

      const t = Math.max(
        -1,
        Math.min(1, value / absMax)
      );

      if (t < 0) {
        const q = t + 1;
        const r = Math.round(42 + 213 * q);
        const g = Math.round(92 + 163 * q);
        const b = Math.round(180 + 75 * q);

        return `rgb(${r},${g},${b})`;
      }

      const q = t;
      const r = Math.round(255);
      const g = Math.round(255 - 210 * q);
      const b = Math.round(255 - 210 * q);

      return `rgb(${r},${g},${b})`;
    }

    const t =
      max === min
        ? 0.5
        : Math.max(
            0,
            Math.min(
              1,
              (value - min) / (max - min)
            )
          );

    const stops = [
      [0, [245,245,245]],
      [0.2, [215,235,245]],
      [0.45, [112,173,209]],
      [0.7, [247,206,92]],
      [1, [180,35,35]]
    ];

    let a = stops[0];
    let b = stops[stops.length - 1];

    for (let i = 0; i < stops.length - 1; i++) {
      if (
        t >= stops[i][0] &&
        t <= stops[i + 1][0]
      ) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }

    const q =
      (t - a[0]) /
      (b[0] - a[0] || 1);

    const rgb = a[1].map(
      (x, i) =>
        Math.round(
          x + (b[1][i] - x) * q
        )
    );

    return `rgb(${rgb.join(',')})`;
  }

  function drawHeatmap(records) {
    const data =
      state.datasets[state.series];

    const conditions =
      META[state.series].conditions;

    const genes =
      records.map(
        r => r.a6 || r.libault
      );

    const matrix =
      records.map(
        r => getValues(data, r)
      );

    const all =
      matrix
        .flat()
        .filter(v => Number.isFinite(v));

    let min =
      all.length
        ? Math.min(...all)
        : 0;

    let max =
      all.length
        ? Math.max(...all)
        : 1;

    /*
     * For Z-score data, keep the color scale centered
     * at zero so negative and positive expression are
     * visually comparable.
     */
    if (state.transform === 'zscore') {
      const absMax =
        Math.max(
          Math.abs(min),
          Math.abs(max)
        );

      min = -absMax;
      max = absMax;
    }

    /*
     * Deterministic gene ordering.
     *
     * Genes are ordered by their mean expression
     * across available conditions, followed by gene ID.
     */
    const order =
      records
        .map((r, i) => {
          const valid =
            matrix[i].filter(
              v => Number.isFinite(v)
            );

          const score =
            valid.length
              ? valid.reduce(
                  (a,b) => a + b,
                  0
                ) / valid.length
              : -Infinity;

          return {
            i,
            score,
            name:
              genes[i] || ''
          };
        })
        .sort(
          (a,b) =>
            b.score - a.score ||
            a.name.localeCompare(b.name)
        );

    let html =
      `<div class="heatmap-title">Gene expression heatmap</div>`;

    html +=
      `<div class="heatmap-subtitle">${esc(META[state.series].title)} · ${genes.length} genes · ${conditions.length} conditions · ${esc(expressionMode())}</div>`;

    html +=
      `<table class="expression-heatmap">`;

    html += `<thead><tr>`;

    html +=
      `<th class="gene-header">Gene</th>`;

    conditions.forEach(condition => {
      html +=
        `<th class="condition" title="${esc(condition)}">${esc(condition)}</th>`;
    });

    html += `</tr></thead><tbody>`;

    order.forEach(item => {
      const i = item.i;
      const gene = genes[i];

      html +=
        `<tr><th class="gene" title="${esc(gene)}">${esc(gene)}</th>`;

      conditions.forEach((condition, ci) => {
        const value =
          matrix[i][ci];

        const valid =
          Number.isFinite(value);

        const background =
          heatmapColor(
            value,
            min,
            max
          );

        const displayValue =
          valid
            ? Number(value).toPrecision(6)
            : 'NA';

        const cellClass =
          valid
            ? 'expression-cell'
            : 'expression-cell missing-cell';

        html +=
          `<td class="${cellClass}" style="background:${background}" title="${esc(gene)} · ${esc(condition)} · ${displayValue}"></td>`;
      });

      html += `</tr>`;
    });

    html +=
      `</tbody></table>`;

    /*
     * Legend
     */
    html +=
      `<div class="heatmap-legend">`;

    if (state.transform === 'zscore') {
      html +=
        `<span class="heatmap-legend-label">${Number(min).toPrecision(3)}</span>`;

      html +=
        `<div class="heatmap-legend-gradient" style="background:linear-gradient(to right,rgb(42,92,180),rgb(255,255,255),rgb(255,45,45))"></div>`;

      html +=
        `<span class="heatmap-legend-label">0</span>`;

      html +=
        `<span class="heatmap-legend-label">${Number(max).toPrecision(3)}</span>`;
    } else {
      html +=
        `<span class="heatmap-legend-label">${Number(min).toPrecision(3)}</span>`;

      html +=
        `<div class="heatmap-legend-gradient" style="background:linear-gradient(to right,rgb(245,245,245),rgb(112,173,209),rgb(247,206,92),rgb(180,35,35))"></div>`;

      html +=
        `<span class="heatmap-legend-label">${Number(max).toPrecision(3)}</span>`;
    }

    html +=
      `<span class="heatmap-legend-label">Gray = missing</span>`;

    html += `</div>`;

    $('heatmapWrap').innerHTML = html;
  }

  function currentConditionValues(data, rec) {
    return getValues(data, rec);
  }

  function toCsv(records) {
    const data =
      state.datasets[state.series];

    const conditions =
      META[state.series].conditions;

    const transformLabel =
      expressionMode();

    const header = [
      'Libault_ID',
      'A4_ID',
      'A6_ID',
      'Mapping_status',
      'Expression_scale',
      ...conditions
    ];

    const lines = [
      header.join(',')
    ];

    records.forEach(r => {
      const values =
        currentConditionValues(data, r);

      lines.push(
        [
          r.libault,
          r.a4,
          r.a6,
          r.status,
          transformLabel,
          ...values.map(
            v =>
              v == null
                ? ''
                : v
          )
        ]
          .map(
            x =>
              `"${String(x ?? '').replaceAll('"','""')}"`
          )
          .join(',')
      );
    });

    return lines.join('\n');
  }

  function render(records, missing) {
    $('resultPanel').hidden = false;

    $('missingPanel').hidden =
      !missing.length;

    $('missingPanel').textContent =
      missing.length
        ? `Not found in the expression index: ${missing.join(', ')}`
        : '';

    const single =
      records.length === 1;

    $('singleGeneView').hidden =
      !single;

    $('multiGeneView').hidden =
      single;

    $('transformWrap').style.display =
      'block';

    $('resultTitle').textContent =
      single
        ? (records[0].a6 || records[0].libault)
        : `${records.length} genes`;

    $('resultSubtitle').textContent =
      `${META[state.series].title} · ${expressionMode()}`;

    if (single) {
      $('singleGeneId').textContent =
        records[0].a6 ||
        records[0].libault;

      $('singleGeneAliases').textContent =
        [
          records[0].a4,
          records[0].libault
        ]
          .filter(Boolean)
          .join(' · ');

      state.single =
        records[0];

      drawEfp(records[0]);

    } else {
      $('multiGeneMeta').textContent =
        `${records.length} genes · ${META[state.series].conditions.length} conditions · ${expressionMode()}`;

      drawHeatmap(records);
    }
  }

  async function analyze() {
    const ids =
      parseIds(
        $('geneInput').value
      );

    if (!ids.length) {
      $('searchStatus').textContent =
        'Enter one or more gene IDs.';

      return;
    }

    $('searchStatus').textContent =
      'Loading validated expression data…';

    try {
      /*
       * Always load the selected dataset for the requested search.
       */
      const data =
        await loadDataset(
          state.series
        );

      /*
       * For a single-gene search, also load the complementary
       * Libault RNA-seq dataset so the eFP browser can display:
       *
       *   Study 2 → non-root tissues
       *   Study 1 → root-hair / infection conditions
       *
       * The datasets remain separate internally.
       */
      if (ids.length === 1) {
        await loadDataset('tissue');
        await loadDataset('root_hair');
      }

      const {
        found,
        missing
      } =
        lookupGenes(
          data,
          ids
        );

      if (!found.length) {
        $('searchStatus').textContent =
          'No matching genes found.';

        return;
      }

      state.genes = found;

      render(
        found,
        missing
      );

      $('searchStatus').textContent =
        `Showing ${found.length} gene${found.length === 1 ? '' : 's'}.`;

    } catch (e) {
      console.error(e);

      $('searchStatus').textContent =
        e.message;
    }
  }


  $('analyzeGenes')
    .addEventListener(
      'click',
      analyze
    );

  $('clearGenes')
    .addEventListener(
      'click',
      () => {
        $('geneInput').value = '';
        $('resultPanel').hidden = true;
        $('searchStatus').textContent = '';
      }
    );

  $('seriesSelect')
    .addEventListener(
      'change',
      async e => {
        state.series =
          e.target.value;

        state.genes = [];
        state.single = null;

        if ($('geneInput').value.trim()) {
          const data =
            await loadDataset(
              state.series
            );

          const {
            found,
            missing
          } =
            lookupGenes(
              data,
              parseIds(
                $('geneInput').value
              )
            );

          state.genes =
            found;

          render(
            found,
            missing
          );
        }
      }
    );

  $('transformSelect')
    .addEventListener(
      'change',
      e => {
        state.transform =
          e.target.value;

        if (state.genes.length) {
          render(
            state.genes,
            []
          );
        }
      }
    );

  $('downloadEfpSvg')
    .addEventListener(
      'click',
      () => {
        const s =
          $('efpSvg');

        if (s) {
          downloadText(
            new XMLSerializer()
              .serializeToString(s),
            'soybean_efp.svg',
            'image/svg+xml'
          );
        }
      }
    );

  $('downloadEfpPng')
    .addEventListener(
      'click',
      () => {
        const s =
          $('efpSvg');

        if (s) {
          svgToPng(
            s,
            'soybean_efp.png'
          );
        }
      }
    );

  $('downloadHeatmapSvg')
    .addEventListener(
      'click',
      () => {
        const s =
          $('heatmapSvg');

        if (s) {
          downloadText(
            new XMLSerializer()
              .serializeToString(s),
            'soybean_expression_heatmap.svg',
            'image/svg+xml'
          );
        }
      }
    );

  $('downloadHeatmapPng')
    .addEventListener(
      'click',
      () => {
        const s =
          $('heatmapSvg');

        if (s) {
          svgToPng(
            s,
            'soybean_expression_heatmap.png'
          );
        }
      }
    );

  $('downloadSingleCsv')
    .addEventListener(
      'click',
      () => {
        if (state.single) {
          downloadText(
            toCsv([state.single]),
            'soybean_gene_expression.csv',
            'text/csv'
          );
        }
      }
    );

  $('downloadMultiCsv')
    .addEventListener(
      'click',
      () => {
        if (state.genes.length) {
          downloadText(
            toCsv(state.genes),
            'soybean_multi_gene_expression.csv',
            'text/csv'
          );
        }
      }
    );

})();
