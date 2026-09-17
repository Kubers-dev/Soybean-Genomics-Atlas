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
        initMultiYearAnalysis();
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

    /*
     * One-year BLUP:
     * Random-genotype model for replicated observations.
     *
     * BLUP_i = grand_mean + shrinkage * (genotype_mean_i - grand_mean)
     *
     * shrinkage = Vg / (Vg + Ve / r)
     *
     * This is appropriate for replicated one-year data and shrinks
     * accession estimates toward the population mean according to
     * the estimated genetic and residual variance.
     */
    const blups = blupForTrait(t);
    const sortedBLUPs = blups
      .slice()
      .sort((a,b)=>b.blup-a.blup)
      .slice(0,Math.min(100,blups.length))
      .sort((a,b)=>a.blup-b.blup);

    const blupTickStep = Math.max(1,Math.ceil(sortedBLUPs.length/18));

    draw("blupPlot",[{
      x:sortedBLUPs.map((d,i)=>i),
      y:sortedBLUPs.map(d=>d.blup),
      text:sortedBLUPs.map(d=>d.accession),
      customdata:sortedBLUPs.map(d=>[
        d.accession,
        d.mean,
        d.blup,
        d.shrinkage,
        d.n
      ]),
      mode:"markers",
      type:"scatter",
      marker:{size:8},
      hovertemplate:
        "<b>%{customdata[0]}</b><br>" +
        "BLUP = %{customdata[2]:.4g}<br>" +
        "Raw mean = %{customdata[1]:.4g}<br>" +
        "Shrinkage = %{customdata[3]:.3f}<br>" +
        "Observations = %{customdata[4]}<extra></extra>"
    }],{
      ...plotBase(`${t}: one-year BLUP estimates`,"Accession","BLUP"),
      xaxis:{
        title:"Accessions (sorted by BLUP)",
        tickmode:"array",
        tickvals:sortedBLUPs
          .map((d,i)=>i)
          .filter(i=>i%blupTickStep===0),
        ticktext:sortedBLUPs
          .map((d,i)=>i%blupTickStep===0?d.accession:"")
          .filter((d,i)=>i%blupTickStep===0),
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

  function blupForTrait(trait){
    if(!replicateKey) return [];

    const by = new Map();

    rows.forEach(r=>{
      const accession = String(r[accessionKey]??"").trim();
      const rep = String(r[replicateKey]??"").trim();
      const value = num(r[trait]);

      if(!accession || !rep || !Number.isFinite(value)) return;

      if(!by.has(accession)) by.set(accession,[]);
      by.get(accession).push(value);
    });

    const groups = [...by.entries()]
      .filter(([,values])=>values.length>0);

    if(!groups.length) return [];

    /*
     * Estimate variance components when replicated data are balanced.
     * For incomplete/unbalanced data, use the average replicate count
     * as the effective replication number and retain the same
     * random-genotype shrinkage framework.
     */
    const all = groups.flatMap(([,values])=>values);
    const grand = mean(all);

    const vc = varianceComponents(trait);

    let vg = vc.vg;
    let ve = vc.ve;

    if(!Number.isFinite(vg) || vg < 0) vg = 0;
    if(!Number.isFinite(ve) || ve < 0) ve = 0;

    const meanReplications =
      groups.reduce((s,[,values])=>s+values.length,0) / groups.length;

    const rEff = Math.max(1,meanReplications);

    const denominator = vg + ve/rEff;
    const shrinkage =
      denominator > 0 ? vg/denominator : 1;

    return groups.map(([accession,values])=>{
      const m = mean(values);
      const blup =
        Number.isFinite(m) && Number.isFinite(grand)
          ? grand + shrinkage*(m-grand)
          : NaN;

      return {
        accession,
        mean:m,
        blup,
        shrinkage,
        n:values.length
      };
    }).filter(d=>Number.isFinite(d.blup));
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

  function plotDownload(key){const map={distribution:"distributionPlot",replicates:"replicatePlot",blup:"blupPlot",scatter:"scatterPlot",correlation:"correlationPlot",pca:"pcaPlot",statsMean:"statsMeanPlot",statsCV:"statsCVPlot",statsH2:"statsH2Plot",qcReplicate:"qcReplicatePlot",qcOutliers:"qcOutlierPlot",qcCV:"qcCVPlot"};const id=map[key];if(!currentPlots[id])return;Plotly.downloadImage($(id),{format:"svg",filename:`soybean_${key}`,width:1600,height:key==="correlation"||key==="pca"?1000:900,scale:1})}
  document.querySelectorAll("[data-download]").forEach(b=>b.addEventListener("click",()=>plotDownload(b.dataset.download)));
  $("phenotypeFile").addEventListener("change",e=>{if(e.target.files[0])parseWorkbook(e.target.files[0])});
  $("downloadGWAS").addEventListener("click",()=>{const maps=traits.map(t=>[t,accessionMeans(t)]);const acc=[...new Set(rows.map(r=>String(r[accessionKey]).trim()).filter(Boolean))];const byTrait=maps.map(([t,a])=>[t,new Map(a.map(d=>[d.accession,d.mean]))]);const out=[["Taxa",...traits]];acc.forEach(a=>out.push([a,...byTrait.map(([,m])=>Number.isFinite(m.get(a))?m.get(a):"")]));download("soybean_GWAS_ready_phenotype.csv",out.map(r=>r.map(csvEscape).join(",")).join("\n"))});
  $("downloadStats").addEventListener("click",()=>{const lines=[["Trait","N","Accessions","Mean","SD","CV_percent","Min","Max","H2"]];traits.forEach(t=>{const v=rows.map(r=>num(r[t])).filter(Number.isFinite),a=accessionMeans(t),h=h2ForTrait(t);lines.push([t,v.length,a.length,mean(v),sd(v),sd(v)/mean(v)*100,Math.min(...v),Math.max(...v),Number.isFinite(h)?h:""])});download("soybean_trait_statistics.csv",lines.map(r=>r.map(csvEscape).join(",")).join("\n"))});
  $("downloadReport").addEventListener("click",()=>{const lines=["Soybean Genomics Atlas — Phenotype & GWAS Analysis","",`Accession column: ${accessionKey}`,`Replicate column: ${replicateKey||"Not detected"}`,`Observations: ${rows.length}`,`Accessions: ${new Set(rows.map(r=>String(r[accessionKey]).trim()).filter(Boolean)).size}`,`Traits: ${traits.length}`,"","Trait statistics:"];traits.forEach(t=>{const v=rows.map(r=>num(r[t])).filter(Number.isFinite);lines.push(`${t}: N=${v.length}; mean=${fmt(mean(v))}; SD=${fmt(sd(v))}; CV%=${fmt(sd(v)/mean(v)*100,2)}; H2=${fmt(h2ForTrait(t))}`)});download("soybean_phenotype_analysis_report.txt",lines.join("\n"),"text/plain;charset=utf-8")});
/* ============================================================
   MULTI-YEAR / MULTI-ENVIRONMENT PHENOTYPE ANALYSIS
   ============================================================ */

let yearKey = null;
let yearEnvironmentKeys = [];

function detectYearColumns(headers) {
  const patterns = [
    /^year$/i,
    /year/i,
    /season/i,
    /environment/i,
    /^env$/i,
    /location/i,
    /site/i,
    /trial/i
  ];

  yearEnvironmentKeys = headers.filter(h =>
    patterns.some(pattern => pattern.test(String(h)))
  );

  return yearEnvironmentKeys;
}

function detectYearColumn(headers) {
  const candidates = detectYearColumns(headers);

  const preferred = candidates.find(h =>
    /^year$/i.test(String(h).trim())
  );

  return preferred || candidates[0] || null;
}

function multiYearLevels() {
  if (!yearKey) return [];

  const values = rows
    .map(r => r[yearKey])
    .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
    .map(v => String(v).trim());

  return [...new Set(values)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

function multiYearData(trait) {
  if (!accessionKey || !yearKey || !trait) return [];

  return rows
    .map(r => ({
      accession: String(r[accessionKey] ?? '').trim(),
      year: String(r[yearKey] ?? '').trim(),
      value: Number(r[trait])
    }))
    .filter(d =>
      d.accession &&
      d.year &&
      Number.isFinite(d.value)
    );
}

function multiYearBLUP(trait) {
  const data = multiYearData(trait);

  if (!data.length) return null;

  const years = [...new Set(data.map(d => d.year))];

  const yearMeans = {};
  years.forEach(y => {
    const vals = data.filter(d => d.year === y).map(d => d.value);
    yearMeans[y] = vals.reduce((a,b) => a+b, 0) / vals.length;
  });

  const adjusted = data.map(d => ({
    ...d,
    adjusted: d.value - yearMeans[d.year]
  }));

  const accessions = [...new Set(adjusted.map(d => d.accession))];

  const accessionStats = accessions.map(acc => {
    const vals = adjusted
      .filter(d => d.accession === acc)
      .map(d => d.adjusted);

    const mean = vals.reduce((a,b) => a+b, 0) / vals.length;

    const rawVals = data
      .filter(d => d.accession === acc)
      .map(d => d.value);

    const rawMean =
      rawVals.reduce((a,b) => a+b, 0) / rawVals.length;

    return {
      accession: acc,
      mean,
      rawMean,
      n: vals.length
    };
  });

  const grand =
    adjusted.reduce((a,b) => a + b.adjusted, 0) /
    adjusted.length;

  const genotypeSS = accessionStats.reduce(
    (s, d) => s + d.n * Math.pow(d.mean - grand, 2),
    0
  );

  const vg =
    accessions.length > 1
      ? genotypeSS / Math.max(accessions.length - 1, 1)
      : 0;

  const residuals = adjusted.map(d => {
    const g = accessionStats.find(
      x => x.accession === d.accession
    );
    return Math.pow(d.adjusted - g.mean, 2);
  });

  const ve =
    residuals.reduce((a,b) => a+b, 0) /
    Math.max(residuals.length - accessions.length, 1);

  const reliability =
    vg > 0
      ? vg / (vg + ve / Math.max(years.length, 1))
      : 0;

  const blups = accessionStats.map(d => {
    const shrinkage =
      (reliability * d.n) /
      (1 + reliability * d.n);

    return {
      ...d,
      blup: grand + shrinkage * (d.mean - grand)
    };
  });

  const grouped = {};
  data.forEach(d => {
    if (!grouped[d.accession]) grouped[d.accession] = {};
    grouped[d.accession][d.year] = d.value;
  });

  const gxYear = blups.map(b => {
    const vals = years
      .map(y => grouped[b.accession]?.[y])
      .filter(Number.isFinite);

    const m =
      vals.length
        ? vals.reduce((a,b) => a+b, 0) / vals.length
        : NaN;

    const sd =
      vals.length > 1
        ? Math.sqrt(
            vals.reduce((s,v) => s + Math.pow(v-m,2),0) /
            (vals.length - 1)
          )
        : 0;

    return {
      ...b,
      yearsPresent: vals.length,
      gxYearSD: sd
    };
  });

  const allValues = data.map(d => d.value);
  const overallMean =
    allValues.reduce((a,b) => a+b,0) /
    allValues.length;

  const totalVar =
    allValues.length > 1
      ? allValues.reduce(
          (s,v) => s + Math.pow(v-overallMean,2), 0
        ) / (allValues.length - 1)
      : 0;

  const gVar = vg;
  const residualVar = Math.max(ve, 0);
  const gxVar = Math.max(
    totalVar - gVar - residualVar,
    0
  );

  return {
    data,
    years,
    yearMeans,
    adjusted,
    blups: gxYear,
    vg: gVar,
    gxVar,
    ve: residualVar,
    totalVar,
    heritability:
      (gVar + gxVar) > 0
        ? gVar / (gVar + gxVar + residualVar)
        : 0
  };
}

function pearsonSimple(a, b) {
  const pairs = [];

  for (let i = 0; i < a.length; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      pairs.push([a[i], b[i]]);
    }
  }

  if (pairs.length < 2) return NaN;

  const ma =
    pairs.reduce((s,p) => s+p[0],0) / pairs.length;
  const mb =
    pairs.reduce((s,p) => s+p[1],0) / pairs.length;

  let num = 0;
  let da = 0;
  let db = 0;

  pairs.forEach(([x,y]) => {
    num += (x-ma)*(y-mb);
    da += Math.pow(x-ma,2);
    db += Math.pow(y-mb,2);
  });

  return da && db
    ? num / Math.sqrt(da*db)
    : NaN;
}

function renderMultiYearAnalysis() {
  const traitSelect =
    document.getElementById('multiYearTraitSelect');

  const yearSelect =
    document.getElementById('multiYearColumnSelect');

  if (!traitSelect || !yearSelect || !traits.length) return;

  traitSelect.innerHTML = traits
    .map(t => `<option value="${t}">${t}</option>`)
    .join('');

  yearSelect.innerHTML = yearKey
    ? `<option value="${yearKey}">${yearKey}</option>`
    : '<option>No year column detected</option>';

  if (!yearKey) {
    document.getElementById('multiYearSection')?.classList.add('hidden');
    return;
  }

  document.getElementById('multiYearSection')?.classList.remove('hidden');

  const trait = traitSelect.value;

  if (yearSelect.value) {
    yearKey = yearSelect.value;
  }

  const result = multiYearBLUP(trait);

  if (!result) return;

  renderMultiYearBLUP(result);
  renderMultiYearInteraction(result);
  renderMultiYearCorrelation(result);
  renderMultiYearHeatmap(result);
  renderMultiYearVariance(result);
  renderMultiYearTable(result);
}

function renderMultiYearBLUP(result) {
  const container =
    document.getElementById('multiYearBlupPlot');

  if (!container) return;

  const top = [...result.blups]
    .sort((a,b) => b.blup-a.blup)
    .slice(0, 30)
    .reverse();

  Plotly.react(
    container,
    [{
      type: 'bar',
      orientation: 'h',
      x: top.map(d => d.blup),
      y: top.map(d => d.accession),
      hovertemplate:
        '<b>%{y}</b><br>BLUP: %{x:.4f}<extra></extra>'
    }],
    {
      margin: {l: 100, r: 30, t: 20, b: 50},
      xaxis: {title: 'BLUP estimate'},
      yaxis: {title: ''},
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent'
    },
    {responsive:true, displaylogo:false}
  );
}

function renderMultiYearInteraction(result) {
  const container =
    document.getElementById('multiYearInteractionPlot');

  if (!container) return;

  const traces = result.years.map(year => {
    const x = [];
    const y = [];

    result.data
      .filter(d => d.year === year)
      .forEach(d => {
        x.push(d.accession);
        y.push(d.value);
      });

    return {
      type: 'scatter',
      mode: 'markers',
      name: year,
      x,
      y
    };
  });

  Plotly.react(
    container,
    traces,
    {
      margin: {l: 60, r: 20, t: 20, b: 100},
      xaxis: {
        title: 'Accession',
        tickangle: -60
      },
      yaxis: {title: 'Trait value'},
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent'
    },
    {responsive:true, displaylogo:false}
  );
}

function renderMultiYearCorrelation(result) {
  const container =
    document.getElementById('multiYearCorrelationPlot');

  if (!container) return;

  const accessions =
    [...new Set(result.data.map(d => d.accession))];

  const matrix = result.years.map(y1 =>
    result.years.map(y2 => {
      const a = [];
      const b = [];

      accessions.forEach(acc => {
        const d1 = result.data.find(
          d => d.accession === acc && d.year === y1
        );

        const d2 = result.data.find(
          d => d.accession === acc && d.year === y2
        );

        if (d1 && d2) {
          a.push(d1.value);
          b.push(d2.value);
        }
      });

      return pearsonSimple(a,b);
    })
  );

  Plotly.react(
    container,
    [{
      type:'heatmap',
      z:matrix,
      x:result.years,
      y:result.years,
      zmin:-1,
      zmax:1,
      colorscale:'RdBu'
    }],
    {
      margin:{l:70,r:20,t:20,b:60},
      xaxis:{title:'Year / environment'},
      yaxis:{title:'Year / environment'},
      paper_bgcolor:'transparent',
      plot_bgcolor:'transparent'
    },
    {responsive:true,displaylogo:false}
  );
}

function renderMultiYearHeatmap(result) {
  const container =
    document.getElementById('multiYearHeatmapPlot');

  if (!container) return;

  const top = [...result.blups]
    .sort((a,b) => b.blup-a.blup)
    .slice(0, 40);

  const z = top.map(acc =>
    result.years.map(year => {
      const d = result.data.find(
        x =>
          x.accession === acc.accession &&
          x.year === year
      );
      return d ? d.value : null;
    })
  );

  Plotly.react(
    container,
    [{
      type:'heatmap',
      z,
      x:result.years,
      y:top.map(d=>d.accession),
      colorscale:'Viridis',
      hoverongaps:false
    }],
    {
      margin:{l:100,r:20,t:20,b:60},
      xaxis:{title:'Year / environment'},
      yaxis:{title:'Accession'},
      paper_bgcolor:'transparent',
      plot_bgcolor:'transparent'
    },
    {responsive:true,displaylogo:false}
  );
}

function renderMultiYearVariance(result) {
  const container =
    document.getElementById('multiYearVariancePlot');

  if (!container) return;

  Plotly.react(
    container,
    [{
      type:'bar',
      x:['Genotype','G × Year','Residual'],
      y:[result.vg,result.gxVar,result.ve]
    }],
    {
      margin:{l:60,r:20,t:20,b:70},
      yaxis:{title:'Variance'},
      paper_bgcolor:'transparent',
      plot_bgcolor:'transparent'
    },
    {responsive:true,displaylogo:false}
  );
}

function renderMultiYearTable(result) {
  const tbody =
    document.querySelector('#multiYearSummaryTable tbody');

  if (!tbody) return;

  tbody.innerHTML = [...result.blups]
    .sort((a,b) => b.blup-a.blup)
    .map(d => `
      <tr>
        <td>${d.accession}</td>
        <td>${d.blup.toFixed(4)}</td>
        <td>${d.rawMean.toFixed(4)}</td>
        <td>${d.yearsPresent}</td>
        <td>${d.gxYearSD.toFixed(4)}</td>
      </tr>
    `)
    .join('');
}

function downloadMultiYearBLUPMatrix() {
  const trait =
    document.getElementById('multiYearTraitSelect')?.value;

  const result = multiYearBLUP(trait);

  if (!result) return;

  const matrix = {};

  result.data.forEach(d => {
    if (!matrix[d.accession])
      matrix[d.accession] = {};

    matrix[d.accession][d.year] = d.value;
  });

  const header = [
    accessionKey,
    ...result.years,
    'Overall_BLUP',
    'Raw_Mean',
    'GX_Year_SD'
  ];

  const lines = [header.join(',')];

  result.blups.forEach(d => {
    const row = [
      d.accession,
      ...result.years.map(y =>
        matrix[d.accession]?.[y] ?? ''
      ),
      d.blup,
      d.rawMean,
      d.gxYearSD
    ];

    lines.push(
      row.map(v =>
        `"${String(v).replaceAll('"','""')}"`
      ).join(',')
    );
  });

  const blob = new Blob(
    [lines.join('\n')],
    {type:'text/csv;charset=utf-8'}
  );

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download =
    `multi_year_BLUP_${trait}.csv`;
  a.click();

  URL.revokeObjectURL(a.href);
}

function downloadMultiYearReport() {
  const trait =
    document.getElementById('multiYearTraitSelect')?.value;

  const result = multiYearBLUP(trait);

  if (!result) return;

  const lines = [
    'MULTI-YEAR PHENOTYPE ANALYSIS REPORT',
    '',
    `Trait: ${trait}`,
    `Accession column: ${accessionKey}`,
    `Year/environment column: ${yearKey}`,
    `Years/environments: ${result.years.join(', ')}`,
    '',
    `Genotype variance: ${result.vg}`,
    `G × Year variance: ${result.gxVar}`,
    `Residual variance: ${result.ve}`,
    `Total variance: ${result.totalVar}`,
    `Genotype proportion: ${result.heritability}`,
    '',
    'Method:',
    'Year-effect adjustment followed by empirical shrinkage to generate BLUP-style genotype estimates.',
    'For complex unbalanced, spatial, or formal REML analyses, confirm results using a dedicated mixed-model package.',
    '',
    'ACCESSION,BLUP,RAW_MEAN,YEARS_PRESENT,GX_YEAR_SD'
  ];

  result.blups
    .sort((a,b)=>b.blup-a.blup)
    .forEach(d => {
      lines.push([
        d.accession,
        d.blup,
        d.rawMean,
        d.yearsPresent,
        d.gxYearSD
      ].join(','));
    });

  const blob = new Blob(
    [lines.join('\n')],
    {type:'text/plain;charset=utf-8'}
  );

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download =
    `multi_year_report_${trait}.txt`;
  a.click();

  URL.revokeObjectURL(a.href);
}

function initMultiYearAnalysis() {
  if (typeof rows === 'undefined' || !rows.length) return;

  const headers = Object.keys(rows[0]);

  yearKey = detectYearColumn(headers);

  const traitSelect =
    document.getElementById('multiYearTraitSelect');

  const yearSelect =
    document.getElementById('multiYearColumnSelect');

  if (!traitSelect || !yearSelect) return;

  traitSelect.innerHTML = traits
    .map(t =>
      `<option value="${esc(t)}">${esc(t)}</option>`
    )
    .join('');

  yearSelect.innerHTML = yearEnvironmentKeys.length
    ? yearEnvironmentKeys
        .map(h =>
          `<option value="${esc(h)}">${esc(h)}</option>`
        )
        .join('')
    : '<option value="">No year/environment column detected</option>';

  if (yearKey && yearEnvironmentKeys.includes(yearKey)) {
    yearSelect.value = yearKey;
  }

  traitSelect.addEventListener(
    'change',
    renderMultiYearAnalysis
  );

  yearSelect.addEventListener(
    'change',
    renderMultiYearAnalysis
  );

  document
    .getElementById('downloadMultiYearBLUP')
    ?.addEventListener(
      'click',
      downloadMultiYearBLUPMatrix
    );

  document
    .getElementById('downloadMultiYearReport')
    ?.addEventListener(
      'click',
      downloadMultiYearReport
    );

  renderMultiYearAnalysis();
}

})();
