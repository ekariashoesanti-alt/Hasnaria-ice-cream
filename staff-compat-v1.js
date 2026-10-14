/* Minimal compatibility layer for older Android Chrome/WebView.
   Keep the original attendance/session validation on the server. */
(function(){
  'use strict';
  if(typeof Promise!=='undefined'&&typeof Promise.prototype.finally!=='function'){
    Promise.prototype.finally=function(onFinally){
      var C=this.constructor;
      if(typeof onFinally!=='function')return this.then(onFinally,onFinally);
      return this.then(function(value){return C.resolve(onFinally()).then(function(){return value;});},function(reason){return C.resolve(onFinally()).then(function(){throw reason;});});
    };
  }
  if(typeof String.prototype.padStart!=='function'){
    String.prototype.padStart=function(length,pad){
      var current=String(this),needed=Math.max(0,Number(length)-current.length);
      var fill=pad===undefined?' ':String(pad),prefix='';
      if(!fill)return current;
      while(prefix.length<needed)prefix+=fill;
      return prefix.slice(0,needed)+current;
    };
  }
})();
