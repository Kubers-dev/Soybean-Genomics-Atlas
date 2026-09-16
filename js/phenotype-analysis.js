/* Soybean Genomics Atlas — Phenotype & GWAS Analysis
 * Client-side analysis. No uploaded phenotype data are sent to a server.
 * Plot typography is standardized for manuscript-oriented exports.
 */
(() => {
  "use strict";
  const FONT = "Arial, Helvetica, sans-serif";
  const PLOT_CONFIG = {responsive:true, displaylogo:false, toImageButtonOptions:{format:"svg", filename:"soybean_phenotype_figure", width:1400, height:850, scale:1}};
  let rows=[], accessionKey=null, replicateKey=null, traits=[], currentPlots={};
  const $=id=>document.getElementById(id);

  function show(id){$(id).hidden=false} function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
  function num(v){ if(v===null||v===undefined||String(v).trim()==="") return NaN; const n=Number(String(v).replace(/,/g,"")); return Number.isFinite(n)?n:NaN }
  function mean(a){const x=a.filter(Number.isFinite);return x.length?x.reduce((s,v)=>s+v,0)/x.length:NaN}
  function sd(a){const x=a.filter(Number.isFinite),m=mean(x);return x.length>1?Math.sqrt(x.reduce((s,v)=>s+(v-m)**2,0)/(x.length-1)):NaN}
  function fmt(v,d=3){return Number.isFinite(v)?v.toLocaleString(undefined,{maximumFractionDigits:d}):"—"}
  function csvEscape(v){const s=String(v??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
  function download(name,text,type="text/csv;charset=utf-8"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}

  function detectKeys(headers){
    const low=headers.map(h=>h.toLowerCase().trim());
    accessionKey=headers[low.findIndex(x=>/^(accession|genotype|germplasm|taxa|taxon|line|entry|sample|id)$/.test(x))]||headers[0];
    replicateKey=headers[low.findIndex(x=>/^(replicate|rep|replication|block|experiment|trial)$/.test(x))]||headers.find(h=>/rep/i.test(h))||null;
    traits=headers.filter(h=>h!==accessionKey&&h!==replicateKey&&rows.some(r=>Number.isFinite(num(r[h]))));
  }

  function parseWorkbook(file){
    const reader=new FileReader(); reader.onload=e=>{
      try{
        let wb;
        if(/\.csv$|\.tsv$|\.txt$/i.test(file.name)){const text=new TextDecoder().decode(e.target.result);wb=XLSX.read(text,{type:"string",cellDates:false,raw:false});}
        else wb=XLSX.read(e.target.result,{type:"array",cellDates:false,raw:false});
        const sheet=wb.Sheets[wb.SheetNames[0]]; rows=XLSX.utils.sheet_to_json(sheet,{defval:""});
        if(!rows.length) throw Error("The file contains no data rows.");
        detectKeys(Object.keys(rows[0]));
        if(!accessionKey||!traits.length) throw Error("Could not identify an accession column and at least one numeric trait.");
        renderOverview(file.name); renderSelectors(); renderAll();
        $("uploadMessage").textContent=`Loaded ${rows.length.toLocaleString()} observations from ${file.name}.`;
      }catch(err){$("uploadMessage").textContent=`Error: ${err.message}`}
    };
    if(/\.csv$|\.tsv$|\.txt$/i.test(file.name)) reader.readAsArrayBuffer(file); else reader.readAsArrayBuffer(file);
  }

  function renderOverview(file){
    const accessions=[...new Set(rows.map(r=>String(r[accessionKey]).trim()).filter(Boolean))];
    const reps=replicateKey?[...new Set(rows.map(r=>String(r[replicateKey]).trim()).filter(Boolean))]:[];
    $("summaryCards").innerHTML=[
      [accessions.length,"Accessions"],[replicateKey?reps.length:"—","Replicates"],[traits.length,"Numeric traits"],[rows.length,"Observations"]
    ].map(([v,l])=>`<div class="metric"><div class="metric-value">${fmt(v,0)}</div><div class="metric-label">${l}</div></div>`).join("");
    const missing=traits.reduce((s,t)=>s+rows.filter(r=>!Number.isFinite(num(r[t]))).length,0);
    $("dataWarnings").innerHTML=`<div class="notice">Detected accession column: <b>${esc(accessionKey)}</b>${replicateKey?` · replicate column: <b>${esc(replicateKey)}</b>`:" · no replicate column was detected"} · missing numeric cells across traits: <b>${missing.toLocaleString()}</b>.</div>`;
    show("overviewSection"); show("analysisSection"); show("statsSection"); show("qcSection"); show("exportSection");
  }

  function renderSelectors(){
    const opts=traits.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
    $("traitSelect").innerHTML=opts; $("trait2Select").innerHTML=opts;
    if(traits.length>1) $("trait2Select").selectedIndex=1;
    $("traitSelect").onchange=renderPlots; $("trait2Select").onchange=renderPlots;
  }

  function accessionMeans(trait){
    const m=new Map(); rows.forEach(r=>{const a=String(r[accessionKey]).trim(),v=num(r[trait]);if(!a||!Number.isFinite(v))return;if(!m.has(a))m.set(a,[]);m.get(a).push(v)});
    return [...m].map(([a,v])=>({accession:a,mean:mean(v),n:v.length,sd:sd(v)}));
  }
  function pearson(x,y){const pairs=x.map((v,i)=>[v,y[i]]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));if(pairs.length<3)return NaN;const mx=mean(pairs.map(p=>p[0])),my=mean(pairs.map(p=>p[1]));const den=Math.sqrt(pairs.reduce((s,p)=>s+(p[0]-mx)**2,0)*pairs.reduce((s,p)=>s+(p[1]-my)**2,0));return den?pairs.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/den:NaN}
  function plotBase(title,xTitle,yTitle){return {title:{text:title,font:{family:FONT,size:17}},font:{family:FONT,size:13,color:"#263238"},paper_bgcolor:"white",plot_bgcolor:"white",margin:{l:70,r:25,t:58,b:70},xaxis:{title:{text:xTitle,font:{family:FONT,size:14}},tickfont:{family:FONT,size:12},showline:true,linewidth:1,mirror:true,gridcolor:"#e8ecee"},yaxis:{title:{text:yTitle,font:{family:FONT,size:14}},tickfont:{family:FONT,size:12},showline:true,linewidth:1,mirror:true,gridcolor:"#e8ecee"},hoverlabel:{font:{family:FONT,size:12}}}}
  function draw(id,data,layout){currentPlots[id]=true;Plotly.newPlot($(id),data,layout,PLOT_CONFIG)}

  function renderPlots(){
    const t=$("traitSelect").value,t2=$("trait2Select").value; if(!t)return;
    const vals=rows.map(r=>num(r[t])).filter(Number.isFinite), m=mean(vals), s=sd(vals);
    draw("distributionPlot",[{x:vals,type:"histogram",nbinsx:Math.min(40,Math.max(10,Math.round(Math.sqrt(vals.length))))}],plotBase(`${t} distribution`,`Value`,`Count`));

    const groups=new Map(); rows.forEach(r=>{if(!replicateKey)return;const a=String(r[accessionKey]).trim(),rep=String(r[replicateKey]).trim(),v=num(r[t]);if(!a||!rep||!Number.isFinite(v))return;if(!groups.has(rep))groups.set(rep,[]);groups.get(rep).push([a,v])});
    const repNames=[...groups.keys()];
    if(repNames.length>=2){const a=new Map(groups.get(repNames[0])),b=new Map(groups.get(repNames[1]));const x=[],y=[];for(const [acc,v] of a){if(b.has(acc)){x.push(v);y.push(b.get(acc))}}draw("replicatePlot",[{x,y,mode:"markers",type:"scatter",text:x.map((_,i)=>i+1),hovertemplate:"x=%{x}<br>y=%{y}<extra></extra>"}],plotBase(`${t}: replicate 1 vs replicate 2`,repNames[0],repNames[1]));$("replicatePlot").on("plotly_afterplot",()=>{});}
    else draw("replicatePlot",[],plotBase("Replicate analysis","Replicate","Value"));

    const am=accessionMeans(t).sort((a,b)=>b.mean-a.mean);const top=am.slice(0,Math.min(100,am.length));
    const sortedMeans=top.slice().sort((a,b)=>a.mean-b.mean);
    const meanTickStep=Math.max(1,Math.ceil(sortedMeans.length/18));
    draw("meansPlot",[{
      x:sortedMeans.map((d,i)=>i),
      y:sortedMeans.map(d=>d.mean),
      text:sortedMeans.map(d=>d.accession),
      customdata:sortedMeans.map(d=>[d.accession,d.sd]),
      mode:"markers",
      type:"scatter",
      marker:{size:7},
      error_y:{
        type:"data",
        array:sortedMeans.map(d=>Number.isFinite(d.sd)?d.sd:0),
        visible:true,
        thickness:1.2,
        width:4
      },
      hovertemplate:"%{customdata[0]}<br>Mean = %{y:.4g}<br>SD = %{customdata[1]:.4g}<extra></extra>"
    }],{
      ...plotBase(`${t}: accession means (± SD)`,"Accession","Mean ± SD"),
      xaxis:{
        title:"Accessions (sorted by mean)",
        tickmode:"array",
        tickvals:sortedMeans.map((d,i)=>i).filter(i=>i%meanTickStep===0),
        ticktext:sortedMeans.map((d,i)=>i%meanTickStep===0?d.accession:"").filter((d,i)=>i%meanTickStep===0),
        tickangle:-45
      },
      showlegend:false
    });

    const a=accessionMeans(t),b=accessionMeans(t2),bm=new Map(b.map(d=>[d.accession,d.mean]));const x=[],y=[],lab=[];a.forEach(d=>{if(bm.has(d.accession)){x.push(d.mean);y.push(bm.get(d.accession));lab.push(d.accession)}});const r=pearson(x,y);
    const mx=mean(x),my=mean(y);
    const xmin=Math.min(...x),xmax=Math.max(...x);
    const ssx=x.reduce((s,v)=>s+(v-mx)*(v-mx),0);
    const slope=ssx?x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/ssx:NaN;
    const intercept=Number.isFinite(slope)?my-slope*mx:NaN;
    const regressionX=[xmin,xmax];
    const regressionY=regressionX.map(v=>Number.isFinite(slope)?intercept+slope*v:NaN);
    const r2=Number.isFinite(r)?r*r:NaN;

    draw("scatterPlot",[
      {
        x,y,text:lab,
        mode:"markers",
        type:"scatter",
        name:"Data points",
        marker:{size:7},
        hovertemplate:"%{text}<br>x=%{x:.4g}<br>y=%{y:.4g}<extra></extra>"
      },
      {
        x:regressionX,
        y:regressionY,
        mode:"lines",
        type:"scatter",
        name:"Regression line",
        line:{width:2}
      }
    ],{
      ...plotBase(`${t} vs ${t2}${Number.isFinite(r)?` (r = ${r.toFixed(3)})`:""}`,t,t2),
      showlegend:true,
      shapes:[
        {
          type:"line",
          x0:mx,x1:mx,
          y0:Math.min(...y),y1:Math.max(...y),
          line:{dash:"dash",width:1.5}
        },
        {
          type:"line",
          x0:Math.min(...x),x1:Math.max(...x),
          y0:my,y1:my,
          line:{dash:"dash",width:1.5}
        }
      ],
      annotations:[
        {
          x:0.98,y:0.98,
          xref:"paper",yref:"paper",
          xanchor:"right",yanchor:"top",
          text:`r = ${Number.isFinite(r)?r.toFixed(3):"—"}<br>R² = ${Number.isFinite(r2)?r2.toFixed(4):"—"}<br>N = ${x.length}`,
          showarrow:false,
          align:"left",
          borderwidth:1,
          borderpad:5
        }
      ]
    });
    renderCorrelation(); renderPCA();
  }

  function renderCorrelation(){const mat=traits.map(t=>traits.map(u=>pearson(rows.map(r=>num(r[t])),rows.map(r=>num(r[u])))));draw("correlationPlot",[{z:mat,x:traits,y:traits,type:"heatmap",zmin:-1,zmax:1,colorscale:"RdBu",reversescale:true,text:mat.map(row=>row.map(v=>Number.isFinite(v)?v.toFixed(2):"")),texttemplate:"%{text}",hovertemplate:"%{y} × %{x}<br>r=%{z:.3f}<extra></extra>"}],{...plotBase("Pearson correlation matrix","Trait","Trait"),margin:{l:150,r:30,t:58,b:130}})}

  function covarianceMatrix(data){const p=data[0].length,n=data.length,mu=Array.from({length:p},(_,j)=>mean(data.map(r=>r[j])));return Array.from({length:p},(_,i)=>Array.from({length:p},(_,j)=>data.reduce((s,r)=>s+(r[i]-mu[i])*(r[j]-mu[j]),0)/(n-1)))}
  function jacobi(A){const n=A.length,V=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));for(let iter=0;iter<100*n*n;iter++){let p=0,q=1,max=0;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(A[i][j])>max){max=Math.abs(A[i][j]);p=i;q=j}if(max<1e-10)break;const phi=.5*Math.atan2(2*A[p][q],A[q][q]-A[p][p]),c=Math.cos(phi),s=Math.sin(phi);for(let i=0;i<n;i++){const aip=A[i][p],aiq=A[i][q];A[i][p]=c*aip-s*aiq;A[i][q]=s*aip+c*aiq}for(let i=0;i<n;i++){const api=A[p][i],aqi=A[q][i];A[p][i]=c*api-s*aqi;A[q][i]=s*api+c*aqi}for(let i=0;i<n;i++){const vip=V[i][p],viq=V[i][q];V[i][p]=c*vip-s*viq;V[i][q]=s*vip+c*viq}}const vals=A.map((r,i)=>r[i]);const order=vals.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]);return {values:order.map(x=>x[0]),vectors:order.map(x=>V.map(r=>r[x[1]]))}}
  function renderPCA(){
    const complete=[];rows.forEach(r=>{const v=traits.map(t=>num(r[t]));if(v.every(Number.isFinite))complete.push(v)});if(complete.length<3||traits.length<2){draw("pcaPlot",[],plotBase("PCA","PC1","PC2"));return}
    const means=traits.map((_,j)=>mean(complete.map(r=>r[j]))),sds=traits.map((_,j)=>sd(complete.map(r=>r[j])));const X=complete.map(r=>r.map((v,j)=>(v-means[j])/(sds[j]||1)));const C=covarianceMatrix(X);const eig=jacobi(C);const total=eig.values.reduce((s,v)=>s+Math.max(0,v),0);const scores=X.map(r=>[r.reduce((s,v,j)=>s+v*eig.vectors[0][j],0),r.reduce((s,v,j)=>s+v*eig.vectors[1][j],0)]);draw("pcaPlot",[{x:scores.map(v=>v[0]),y:scores.map(v=>v[1]),mode:"markers",type:"scatter",hovertemplate:"PC1=%{x:.3f}<br>PC2=%{y:.3f}<extra></extra>"}],{...plotBase(`PCA (PC1 ${(eig.values[0]/total*100).toFixed(1)}% · PC2 ${(eig.values[1]/total*100).toFixed(1)}%)`,`PC1`,`PC2`)});
  }

  function h2ForTrait(t){
    if(!replicateKey)return NaN;const by=new Map();rows.forEach(r=>{const a=String(r[accessionKey]).trim(),v=num(r[t]);if(!a||!Number.isFinite(v))return;if(!by.has(a))by.set(a,[]);by.get(a).push(v)});const groups=[...by.values()];if(!groups.length||new Set(groups.map(g=>g.length)).size!==1||groups[0].length<2)return NaN;const r=groups[0].length,k=groups.length,all=groups.flat(),grand=mean(all);const msG=r*groups.reduce((s,g)=>s+(mean(g)-grand)**2,0)/(k-1);const msE=groups.reduce((s,g)=>s+g.reduce((z,v)=>z+(v-mean(g))**2,0),0)/(k*(r-1));return (msG-msE)/(msG+(r-1)*msE)}
  function varianceComponents(trait){
    if(!replicateKey) return {vg:NaN,ve:NaN,h2:NaN,reps:0,complete:0};

    const by=new Map();
    rows.forEach(r=>{
      const a=String(r[accessionKey]??"").trim();
      const rep=String(r[replicateKey]??"").trim();
      const v=num(r[trait]);
      if(!a||!rep||!Number.isFinite(v)) return;
      if(!by.has(a)) by.set(a,new Map());
      by.get(a).set(rep,v);
    });

    const groups=[...by.values()];
    const repCounts=groups.map(g=>g.size);
    const reps=repCounts.length?Math.max(...repCounts):0;
    const balanced=groups.length>1 && repCounts.every(n=>n===repCounts[0]) && repCounts[0]>1;

    if(!balanced) return {vg:NaN,ve:NaN,h2:NaN,reps,complete:groups.filter(g=>g.size===reps).length};

    const r=repCounts[0],k=groups.length;
    const all=[...groups.flatMap(g=>[...g.values()])];
    const grand=mean(all);

    const msG=r*groups.reduce((sum,g)=>{
      return sum+(mean([...g.values()])-grand)**2;
    },0)/(k-1);

    const msE=groups.reduce((sum,g)=>{
      const vals=[...g.values()],m=mean(vals);
      return sum+vals.reduce((z,v)=>z+(v-m)**2,0);
    },0)/(k*(r-1));

    const ve=msE;
    const vg=Math.max(0,(msG-msE)/r);
    const h2=(vg+ve)>0?vg/(vg+ve):NaN;

    return {vg,ve,h2,reps:r,complete:k};
  }

  function renderStats(){
    const body=$("statsTable tbody");

    const rowsOut=[];

    traits.forEach(t=>{
      const vals=rows.map(r=>num(r[t])).filter(Number.isFinite);
      const accessions=[...new Set(
        rows.map(r=>String(r[accessionKey]??"").trim())
            .filter((a,i)=>a && Number.isFinite(num(rows[i][t])))
      )];

      const reps=replicateKey
        ? [...new Set(rows.map(r=>String(r[replicateKey]??"").trim()).filter(Boolean))]
        : [];

      const m=mean(vals);
      const s=sd(vals);
      const se=vals.length>1?s/Math.sqrt(vals.length):NaN;
      const cv=Number.isFinite(m)&&m!==0?s/m*100:NaN;
      const vc=varianceComponents(t);

      const params=[
        ["Trait",t],
        ["Number of observations",vals.length],
        ["Number of accessions",accessions.length],
        ["Number of replicates",reps.length||"—"],
        ["Mean",fmt(m)],
        ["SD",fmt(s)],
        ["SE",fmt(se)],
        ["CV%",fmt(cv,2)],
        ["Minimum",vals.length?fmt(Math.min(...vals)):"—"],
        ["Maximum",vals.length?fmt(Math.max(...vals)):"—"],
        ["Genotypic variance",fmt(vc.vg)],
        ["Residual variance",fmt(vc.ve)],
        ["H²",Number.isFinite(vc.h2)?fmt(vc.h2,3):"—"]
      ];

      params.forEach(([parameter,value])=>{
        rowsOut.push(
          `<tr><td>${esc(parameter)}</td><td>${esc(value)}</td></tr>`
        );
      });

      rowsOut.push(
        `<tr class="trait-divider"><td colspan="2"><strong>${esc(t)}</strong></td></tr>`
      );
    });

    if(rowsOut.length){
      body.innerHTML=rowsOut.join("");
    }else{
      body.innerHTML=`<tr><td colspan="2">No numeric trait data available.</td></tr>`;
    }
  }

  function renderQC(){
    let missingTotal=0;

    const missingByTrait=[];
    const missingByAccession=new Map();
    const out=[];

    traits.forEach(t=>{
      let n=0;

      rows.forEach(r=>{
        const a=String(r[accessionKey]??"").trim();
        const v=num(r[t]);

        if(!Number.isFinite(v)){
          n++;
          missingTotal++;

          if(a){
            if(!missingByAccession.has(a)) missingByAccession.set(a,0);
            missingByAccession.set(a,missingByAccession.get(a)+1);
          }
        }
      });

      missingByTrait.push([t,n]);
    });

    traits.forEach(t=>{
      const vals=rows.map(r=>num(r[t])).filter(Number.isFinite);
      const m=mean(vals);
      const s=sd(vals);

      if(!Number.isFinite(s)||s===0) return;

      rows.forEach(r=>{
        const v=num(r[t]);
        if(Number.isFinite(v)&&Math.abs(v-m)>3*s){
          out.push([
            String(r[accessionKey]??""),
            replicateKey?String(r[replicateKey]??""):"",
            t,
            v,
            "|z| > 3"
          ]);
        }
      });
    });

    const accessionMissingHTML=[...missingByAccession.entries()]
      .sort((a,b)=>b[1]-a[1])
      .slice(0,20)
      .map(([a,n])=>`${esc(a)}: ${n}`)
      .join("<br>") || "None";

    const traitMissingHTML=missingByTrait
      .filter(([,n])=>n>0)
      .map(([t,n])=>`${esc(t)}: ${n}`)
      .join("<br>") || "None";

    let replicateText="Not detected";

    if(replicateKey){
      const reps=[...new Set(
        rows.map(r=>String(r[replicateKey]??"").trim()).filter(Boolean)
      )];

      const expected=reps.length*new Set(
        rows.map(r=>String(r[accessionKey]??"").trim()).filter(Boolean)
      ).size*traits.length;

      const observed=rows.reduce((sum,r)=>{
        return sum+traits.filter(t=>Number.isFinite(num(r[t]))).length;
      },0);

      const completeness=expected>0?observed/expected*100:NaN;

      replicateText=`${esc(replicateKey)}: ${reps.length} replicates · ${Number.isFinite(completeness)?completeness.toFixed(1)+"%":"—"} completeness`;
    }

    $("qcSummary").innerHTML=`
      <div class="qc-box">
        <strong>${missingTotal}</strong>
        <span>Missing observations</span>
      </div>

      <div class="qc-box">
        <strong>${out.length}</strong>
        <span>Potential outliers</span>
      </div>

      <div class="qc-box">
        <strong>${replicateKey?"Detected":"Not detected"}</strong>
        <span>Replicate completeness</span>
      </div>

      <div class="qc-box">
        <strong>${missingByAccession.size}</strong>
        <span>Accessions with missing observations</span>
      </div>

      <div class="qc-box">
        <strong>${missingByTrait.filter(([,n])=>n>0).length}</strong>
        <span>Traits with missing observations</span>
      </div>

      <div class="qc-box qc-wide">
        <strong>Missing observations by accession</strong>
        <span>${accessionMissingHTML}</span>
      </div>

      <div class="qc-box qc-wide">
        <strong>Missing observations by trait</strong>
        <span>${traitMissingHTML}</span>
      </div>

      <div class="qc-box qc-wide">
        <strong>Replicate completeness</strong>
        <span>${replicateText}</span>
      </div>
    `;

    $("outlierTable").querySelector("thead").innerHTML=`
      <tr>
        <th>Accession</th>
        <th>Replicate</th>
        <th>Trait</th>
        <th>Value</th>
        <th>Reason</th>
      </tr>
    `;

    $("outlierTable tbody").innerHTML=out.slice(0,500).map(o=>
      `<tr>${o.map(v=>`<td>${esc(fmt(v))}</td>`).join("")}</tr>`
    ).join("");
  }

  function renderStatsPlots(){
    const names = [];
    const means = [];
    const sds = [];
    const cvs = [];
    const h2s = [];

    traits.forEach(t=>{
      const vals = rows.map(r=>num(r[t])).filter(Number.isFinite);
      if(!vals.length) return;

      const m = mean(vals);
      const s = sd(vals);
      const cv = Number.isFinite(m) && m !== 0 ? Math.abs(s/m*100) : NaN;
      const vc = varianceComponents(t);

      names.push(t);
      means.push(m);
      sds.push(Number.isFinite(s) ? s : 0);
      cvs.push(Number.isFinite(cv) ? cv : 0);
      h2s.push(Number.isFinite(vc.h2) ? vc.h2 : NaN);
    });

    draw("statsMeanPlot",[{
      x:names,
      y:means,
      type:"bar",
      error_y:{
        type:"data",
        array:sds,
        visible:true
      },
      hovertemplate:
        "<b>%{x}</b><br>Mean = %{y:.4g}<br>SD = %{error_y.array:.4g}<extra></extra>"
    }],{
      ...plotBase("Trait mean ± SD","Trait","Mean"),
      xaxis:{...plotBase("","","").xaxis,tickangle:-45},
      showlegend:false
    });

    draw("statsCVPlot",[{
      x:names,
      y:cvs,
      type:"bar",
      hovertemplate:"<b>%{x}</b><br>CV = %{y:.2f}%<extra></extra>"
    }],{
      ...plotBase("Trait coefficient of variation","Trait","CV (%)"),
      xaxis:{...plotBase("","","").xaxis,tickangle:-45},
      showlegend:false
    });

    const h2Names = [];
    const h2Values = [];

    names.forEach((t,i)=>{
      if(Number.isFinite(h2s[i])){
        h2Names.push(t);
        h2Values.push(h2s[i]);
      }
    });

    if(h2Names.length){
      draw("statsH2Plot",[{
        x:h2Names,
        y:h2Values,
        type:"bar",
        hovertemplate:"<b>%{x}</b><br>H² = %{y:.3f}<extra></extra>"
      }],{
        ...plotBase("Broad-sense heritability","Trait","H²"),
        xaxis:{...plotBase("","","").xaxis,tickangle:-45},
        yaxis:{...plotBase("","","").yaxis,range:[0,1]},
        showlegend:false
      });
    }else{
      draw("statsH2Plot",[],plotBase("Broad-sense heritability","Trait","H²"));
    }
  }

  function renderQCPlots(){
    const names = [];
    const outlierCounts = [];
    const cvs = [];

    traits.forEach(t=>{
      const vals = rows.map(r=>num(r[t])).filter(Number.isFinite);
      if(!vals.length) return;

      const m = mean(vals);
      const s = sd(vals);

      let outliers = 0;
      if(Number.isFinite(s) && s > 0){
        vals.forEach(v=>{
          if(Math.abs(v-m)>3*s) outliers++;
        });
      }

      const cv = Number.isFinite(m) && m !== 0 && Number.isFinite(s)
        ? Math.abs(s/m*100)
        : 0;

      names.push(t);
      outlierCounts.push(outliers);
      cvs.push(cv);
    });

    draw("qcOutlierPlot",[{
      x:names,
      y:outlierCounts,
      type:"bar",
      hovertemplate:"<b>%{x}</b><br>Potential outliers = %{y}<extra></extra>"
    }],{
      ...plotBase("Potential outliers by trait","Trait","Outlier count"),
      xaxis:{...plotBase("","","").xaxis,tickangle:-45},
      showlegend:false
    });

    draw("qcCVPlot",[{
      x:names,
      y:cvs,
      type:"bar",
      hovertemplate:"<b>%{x}</b><br>CV = %{y:.2f}%<extra></extra>"
    }],{
      ...plotBase("Replicate / phenotype variability","Trait","CV (%)"),
      xaxis:{...plotBase("","","").xaxis,tickangle:-45},
      showlegend:false
    });

    if(replicateKey){
      const reps = [...new Set(
        rows.map(r=>String(r[replicateKey]??"").trim()).filter(Boolean)
      )];

      if(reps.length >= 2){
        const repA = new Map();
        const repB = new Map();

        rows.forEach(r=>{
          const a = String(r[accessionKey]??"").trim();
          const rep = String(r[replicateKey]??"").trim();
          const v = num(r[traits[0]]);
          if(!a || !rep || !Number.isFinite(v)) return;

          if(rep === reps[0]) repA.set(a,v);
          if(rep === reps[1]) repB.set(a,v);
        });

        const x = [];
        const y = [];
        const labels = [];

        repA.forEach((v,a)=>{
          if(repB.has(a)){
            x.push(v);
            y.push(repB.get(a));
            labels.push(a);
          }
        });

        const r = pearson(x,y);

        draw("qcReplicatePlot",[{
          x:x,
          y:y,
          text:labels,
          mode:"markers",
          type:"scatter",
          marker:{size:8},
          hovertemplate:
            "<b>%{text}</b><br>" +
            `${reps[0]} = %{x:.4g}<br>` +
            `${reps[1]} = %{y:.4g}<extra></extra>`
        }],{
          ...plotBase(
            `Replicate consistency${Number.isFinite(r) ? ` (r = ${r.toFixed(3)})` : ""}`,
            reps[0],
            reps[1]
          ),
          showlegend:false
        });
      }else{
        draw(
          "qcReplicatePlot",
          [],
          plotBase("Replicate consistency","Replicate 1","Replicate 2")
        );
      }
    }else{
      draw(
        "qcReplicatePlot",
        [],
        plotBase("Replicate consistency","Replicate 1","Replicate 2")
      );
    }
  }

  function renderAll(){
    renderPlots();
    renderStatsPlots();
    renderQCPlots();
    renderStats();
    renderQC();
  }

  function resizeAnalysisPlots(){
    ["statsMeanPlot","statsCVPlot","statsH2Plot","qcReplicatePlot","qcOutlierPlot","qcCVPlot"].forEach(id=>{
      const el=$(id);
      if(el && el.data) Plotly.Plots.resize(el);
    });
  }

  window.addEventListener("resize", resizeAnalysisPlots);

  function plotDownload(key){const map={distribution:"distributionPlot",replicates:"replicatePlot",means:"meansPlot",scatter:"scatterPlot",correlation:"correlationPlot",pca:"pcaPlot",statsMean:"statsMeanPlot",statsCV:"statsCVPlot",statsH2:"statsH2Plot",qcReplicate:"qcReplicatePlot",qcOutliers:"qcOutlierPlot",qcCV:"qcCVPlot"};const id=map[key];if(!currentPlots[id])return;Plotly.downloadImage($(id),{format:"svg",filename:`soybean_${key}`,width:1600,height:key==="correlation"||key==="pca"?1000:900,scale:1})}
  document.querySelectorAll("[data-download]").forEach(b=>b.addEventListener("click",()=>plotDownload(b.dataset.download)));
  $("phenotypeFile").addEventListener("change",e=>{if(e.target.files[0])parseWorkbook(e.target.files[0])});
  $("downloadGWAS").addEventListener("click",()=>{const maps=traits.map(t=>[t,accessionMeans(t)]);const acc=[...new Set(rows.map(r=>String(r[accessionKey]).trim()).filter(Boolean))];const byTrait=maps.map(([t,a])=>[t,new Map(a.map(d=>[d.accession,d.mean]))]);const out=[["Taxa",...traits]];acc.forEach(a=>out.push([a,...byTrait.map(([,m])=>Number.isFinite(m.get(a))?m.get(a):"")]));download("soybean_GWAS_ready_phenotype.csv",out.map(r=>r.map(csvEscape).join(",")).join("\n"))});
  $("downloadStats").addEventListener("click",()=>{const lines=[["Trait","N","Accessions","Mean","SD","CV_percent","Min","Max","H2"]];traits.forEach(t=>{const v=rows.map(r=>num(r[t])).filter(Number.isFinite),a=accessionMeans(t),h=h2ForTrait(t);lines.push([t,v.length,a.length,mean(v),sd(v),sd(v)/mean(v)*100,Math.min(...v),Math.max(...v),Number.isFinite(h)?h:""])});download("soybean_trait_statistics.csv",lines.map(r=>r.map(csvEscape).join(",")).join("\n"))});
  $("downloadReport").addEventListener("click",()=>{const lines=["Soybean Genomics Atlas — Phenotype & GWAS Analysis","",`Accession column: ${accessionKey}`,`Replicate column: ${replicateKey||"Not detected"}`,`Observations: ${rows.length}`,`Accessions: ${new Set(rows.map(r=>String(r[accessionKey]).trim()).filter(Boolean)).size}`,`Traits: ${traits.length}`,"","Trait statistics:"];traits.forEach(t=>{const v=rows.map(r=>num(r[t])).filter(Number.isFinite);lines.push(`${t}: N=${v.length}; mean=${fmt(mean(v))}; SD=${fmt(sd(v))}; CV%=${fmt(sd(v)/mean(v)*100,2)}; H2=${fmt(h2ForTrait(t))}`)});download("soybean_phenotype_analysis_report.txt",lines.join("\n"),"text/plain;charset=utf-8")});
})();
