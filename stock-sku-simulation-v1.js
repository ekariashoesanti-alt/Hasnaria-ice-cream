/* HASNARIA — monthly SKU -> BOM source-only simulation.
 * Any output is a theoretical raw recipe requirement, NEVER a warehouse debit.
 * Financial and stock posting must be independently authorized.
 */
(function(root){
  'use strict';
  function text(x){return String(x==null?'':x).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
  function validCount(x){return Number.isSafeInteger(Number(x))&&Number(x)>=0;}
  function calc(input){
    var o=input||{},b=o.batch||{},lines=o.lines||[],products=o.products||[],
      components=o.components||[],items=o.items||[],approvals=o.approvals||[],
      conversions=o.conversions||[];
    if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(String(b.period_month||'').slice(0,10)))
      throw Error('Periode batch SKU tidak valid');
    if(b.status!=='under_review'&&b.status!=='approved')
      throw Error('Status batch SKU tidak cocok untuk simulasi read-only');
    if(!Array.isArray(lines)||!lines.length||lines.length>500)
      throw Error('Baris SKU tidak lengkap');
    if(Number(b.source_row_count)!==lines.length)
      throw Error('Jumlah baris SKU berbeda dari tanda terima batch');
    var index=new Map(),inventory=new Map(),approval=new Map(),componentMap=new Map(),
      convertMap=new Map(),seenSku=new Set(),ingredients=new Map(),productResults=[],unresolved=[];
    products.forEach(function(p){
      if(!p||!p.id||!text(p.name))return;
      var key=text(p.name),group=index.get(key)||[];
      group.push(p);index.set(key,group);
    });
    items.forEach(function(x){if(x&&x.id)inventory.set(x.id,x)});
    approvals.forEach(function(x){if(x&&x.product_id)approval.set(x.product_id,x)});
    components.forEach(function(c){
      if(!c||!c.product_id||c.active===false)return;
      var ar=componentMap.get(c.product_id)||[];ar.push(c);componentMap.set(c.product_id,ar);
    });
    conversions.forEach(function(c){
      if(!c||!c.product_id||!c.inventory_item_id)return;
      var k=c.product_id+'|'+c.inventory_item_id;
      var a=convertMap.get(k)||[];a.push(c);convertMap.set(k,a);
    });
    var totalUnits=0,skuWithBom=0,unitsWithBom=0,unsafeMapping=0,
      refundsExposure=0,qtySourceReady=0,missingBom=0,unitsNoBom=0;
    lines.forEach(function(line){
      var name=String(line.source_product_name||'').trim(),sku=String(line.source_sku||'').trim(),
        key=text(sku),qty=Number(line.quantity),refund=Number(line.refund_quantity||0);
      if(!sku||!name||seenSku.has(key))throw Error('SKU sumber kosong atau duplikat');
      seenSku.add(key);
      if(!validCount(qty)||!validCount(refund)||refund>qty)
        throw Error('Qty / refund SKU tidak valid');
      totalUnits+=qty; refundsExposure+=refund;
      var matches=index.get(text(name))||[],p=matches.length===1?matches[0]:null,
        raw=p?componentMap.get(p.id)||[]:[],componentsValid=raw.length>0&&raw.every(function(c){
          return c.inventory_item_id&&Number(c.qty_per_sale)>0&&Number.isFinite(Number(c.qty_per_sale))&&inventory.has(c.inventory_item_id);
        });
      var reason=!p?(matches.length?'AMBIGUOUS_NAME':'UNMATCHED_NAME'):
        !p.active?'INACTIVE_PRODUCT':!raw.length?'NO_BOM':
        !componentsValid?'INVALID_BOM':'BOM_PRESENT_UNAPPROVED';
      if(!p||!p.active||!componentsValid){
        if(reason==='NO_BOM'){missingBom++;unitsNoBom+=qty;}
        unresolved.push({sku:sku,name:name,quantity:qty,reason:reason});
        if(!p||!p.active)unsafeMapping++;
      }else{
        skuWithBom++;unitsWithBom+=qty;
        var approved=approval.get(p.id);
        var fullyApproved=approved&&approved.status==='verified';
        // Group by inventory item + ORIGINAL unit, not price, SKU name or package size.
        raw.forEach(function(c){
          var item=inventory.get(c.inventory_item_id),unit=String(item.unit||'').trim(),
            amount=qty*Number(c.qty_per_sale),potentialRefund=refund*Number(c.qty_per_sale),
            k=item.id+'|'+unit,
            conversionsFor=convertMap.get(p.id+'|'+item.id)||[],
            conversionVerified=conversionsFor.length>0&&
              conversionsFor.every(function(x){return x.status==='verified'&&Number(x.units_per_purchase_unit)>0});
          if(!Number.isFinite(amount)||!Number.isFinite(potentialRefund)||amount<0)
            throw Error('Kebutuhan BOM melewati batas aman');
          var result=ingredients.get(k)||{inventory_item_id:item.id,item_name:String(item.item_name||''),
            unit:unit||'satuan belum diketahui',raw_requirement:0,possible_refund_raw:0,
            product_ids:new Set(),needs_review:false,non_approved_rows:0,conversion_coverage:false};
          result.raw_requirement+=amount;
          result.possible_refund_raw+=potentialRefund;
          result.product_ids.add(p.id);
          var needsReview=!fullyApproved||c.bom_status!=='verified'||!conversionVerified||!unit;
          result.needs_review=result.needs_review||needsReview;
          if(needsReview)result.non_approved_rows++;
          result.conversion_coverage=result.conversion_coverage||conversionVerified;
          ingredients.set(k,result);
        });
        if(fullyApproved&&raw.every(function(c){return c.bom_status==='verified'}))qtySourceReady++;
      }
      productResults.push({sku:sku,name:name,quantity:qty,refund_quantity:refund,
        product_id:p?p.id:null,mapping_by_name_only:!!p,has_bom:!!(p&&p.active&&componentsValid),
        status:reason});
    });
    var summary=Array.from(ingredients.values()).map(function(x){return {
      inventory_item_id:x.inventory_item_id,item_name:x.item_name,unit:x.unit,
      raw_requirement:Number(x.raw_requirement.toFixed(6)),
      possible_refund_raw:Number(x.possible_refund_raw.toFixed(6)),
      contributing_products:x.product_ids.size,needs_review:x.needs_review,
      non_approved_rows:x.non_approved_rows,conversion_coverage:x.conversion_coverage
    }}).sort(function(a,b){return text(a.item_name).localeCompare(text(b.item_name))||text(a.unit).localeCompare(text(b.unit))});
    if(!Number.isSafeInteger(totalUnits))throw Error('Qty sumber melampaui batas aman');
    return {
      period_month:String(b.period_month).slice(0,10),source_status:b.status,
      source_batch_id:b.id||null,source_sha256:b.file_sha256||null,
      source_sku_count:lines.length,total_units:totalUnits,refunded_units:refundsExposure,
      unique_name_mapped:lines.length-unsafeMapping,
      bom_sku_count:skuWithBom,bom_units:unitsWithBom,
      no_bom_sku_count:missingBom,no_bom_units:unitsNoBom,
      recipe_verified_sku_count:qtySourceReady,
      ingredients:summary,unresolved:unresolved,products:productResults,
      report_not_final:b.status!=='approved',all_source_units_raw:true,
      can_modify_operational_stock:false,stock_posting_allowed:false,
      can_calculate_physical_warehouse_deduction:false
    };
  }
  var api={calculate:calc};
  if(root)root.__HASNARIA_STOCK_SKU_SIM_V1=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:null);
