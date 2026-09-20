/* Repair Majoo XLSX exports whose worksheet !ref is smaller than the actual used cells. */
(function(){
  'use strict';
  if(window.__HASNARIA_PURCHASE_MAJOO_RANGE_FIX)return;
  window.__HASNARIA_PURCHASE_MAJOO_RANGE_FIX=true;

  function install(){
    if(!window.XLSX||!XLSX.utils||!XLSX.utils.sheet_to_json||!XLSX.utils.decode_cell||!XLSX.utils.encode_range){
      setTimeout(install,50);
      return;
    }
    if(XLSX.utils.sheet_to_json.__hasnariaRangeFixed)return;

    var original=XLSX.utils.sheet_to_json;

    function expandRef(ws){
      if(!ws||typeof ws!=='object')return;
      var minR=Infinity,minC=Infinity,maxR=-1,maxC=-1;
      Object.keys(ws).forEach(function(key){
        if(!key||key.charAt(0)==='!')return;
        try{
          var cell=XLSX.utils.decode_cell(key);
          if(cell.r<minR)minR=cell.r;
          if(cell.c<minC)minC=cell.c;
          if(cell.r>maxR)maxR=cell.r;
          if(cell.c>maxC)maxC=cell.c;
        }catch(_){ }
      });
      if(maxR<0||maxC<0)return;
      var actual={s:{r:minR,c:minC},e:{r:maxR,c:maxC}};
      var current=null;
      try{current=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):null;}catch(_){current=null;}
      if(!current||actual.s.r<current.s.r||actual.s.c<current.s.c||actual.e.r>current.e.r||actual.e.c>current.e.c){
        ws['!ref']=XLSX.utils.encode_range(actual);
      }
    }

    function wrapped(ws,opts){
      expandRef(ws);
      return original.call(this,ws,opts);
    }
    wrapped.__hasnariaRangeFixed=true;
    wrapped.__original=original;
    XLSX.utils.sheet_to_json=wrapped;
    window.__HASNARIA_EXPAND_XLSX_REF=expandRef;
  }

  install();
})();
