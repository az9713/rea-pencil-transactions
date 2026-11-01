// Invented .pen2.21-shaped fixture; no installed client or real design file used.
export const fixture={version:'2.21',metadata:{synthetic:true,workbench:'original research fixture'},children:[
  {id:'lab-a',type:'frame',name:'Observation workspace',layout:'none',x:0,y:0,width:620,height:390,fill:'#142632',cornerRadius:18,children:[
    {id:'title-a',type:'text',name:'Research heading',x:28,y:28,width:550,height:40,content:'OBSERVATION / 01',fontSize:25,fill:'#D4EEE7',future_text:{keep:'all fields'}},
    {id:'sample-card',type:'rectangle',name:'Measured sample',x:28,y:104,width:256,height:200,fill:'#36596B',cornerRadius:12,metadata:{type:'research-sample',provenance:'synthetic',uncertainty:0.12}},
    {id:'sample-label',type:'text',name:'Sample caption',x:48,y:132,width:210,height:60,content:'Reference sample\n42 ± 2 units',fontSize:18,fill:'#EFF5F7'},
    {id:'signal',type:'ellipse',name:'Signal marker',x:362,y:120,width:144,height:144,fill:'#C4B58A',opacity:0.9}
  ]},
  {id:'lab-b',type:'frame',name:'Comparison workspace',layout:'none',x:690,y:0,width:620,height:390,fill:'#18222F',cornerRadius:18,children:[
    {id:'title-b',type:'text',name:'Comparison heading',x:28,y:28,width:550,height:40,content:'COMPARISON / 02',fontSize:25,fill:'#B7CEDF'},
    {id:'target-slot',type:'rectangle',name:'Target region',x:28,y:104,width:256,height:200,fill:'#233747',cornerRadius:12,future_setting:{preserve:true}}
  ]},
  {id:'opaque-script',type:'script',name:'Opaque script (never executed)',x:0,y:455,width:300,height:70,scriptUri:'./never-executed.js',inputs:{seed:17},future_shader:{untouched:true}}
]};
