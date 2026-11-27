export async function readSpreadsheet(file:File){
  if(file.size>3_000_000)throw new Error("Use a CSV or Excel file under 3 MB.");
  const {Workbook}=await import("exceljs");
  const workbook=new Workbook();
  let worksheet;
  if(file.name.toLowerCase().endsWith(".xlsx")){
    await workbook.xlsx.load(await file.arrayBuffer());
    worksheet=workbook.worksheets[0];
  }else if(file.name.toLowerCase().endsWith(".csv")){
    return parseCsv(await file.text());
  }else throw new Error("Select a CSV or XLSX spreadsheet.");
  if(!worksheet)return [];
  if(worksheet.rowCount>2001 || worksheet.columnCount>80)throw new Error("The spreadsheet is too large.");
  const headers:Array<string>=[];
  worksheet.getRow(1).eachCell((cell,index)=>{headers[index]=cell.text.trim().toLowerCase().replace(/^\ufeff/,"");});
  const rows:Record<string,string>[]=[];
  worksheet.eachRow((row,i)=>{
    if(i===1)return;
    const values:Record<string,string>={};
    row.eachCell({includeEmpty:true},(cell,index)=>{const header=headers[index];if(header)values[header]=cell.value instanceof Date?cell.value.toISOString().slice(0,10):cell.text;});
    rows.push(values);
  });
  return rows;
}
function parseCsv(input:string){
  const rows:string[][]=[]; let row:string[]=[]; let value=""; let quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted && c==='"' && input[i+1]==='"'){value+='"';i++;}
    else if(c==='"')quoted=!quoted;
    else if(!quoted && (c===","||c==="\n")){
      row.push(value.replace(/\r$/,""));value="";
      if(c==="\n"){rows.push(row);row=[];}
    }else value+=c;
  }
  if(quoted)throw new Error("A quoted CSV field is incomplete.");
  if(value.length||row.length)rows.push([...row,value.replace(/\r$/,"")]);
  const [first,...rest]=rows;
  if(!first)return [];
  const headers=first.map(key=>key.trim().toLowerCase().replace(/^\ufeff/,""));
  return rest.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.flatMap((key,i)=>key?[[key,r[i]??""]]:[])));
}
export function downloadCsv(title:string, columns:string[], rows:unknown[][]){
  const encode=(value:unknown)=>'"'+String(value??"").replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
  const content=[columns,...rows].map(row=>row.map(encode).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=title+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
