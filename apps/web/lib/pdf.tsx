import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Report } from "./report";
const s=StyleSheet.create({
  page:{padding:34,paddingBottom:49,fontFamily:"Helvetica",fontSize:9,color:"#1b2037"},
  title:{fontSize:23,fontFamily:"Helvetica-Bold",marginTop:6,marginBottom:5,color:"#15172f"},
  brand:{fontSize:12,color:"#6d28d9",fontFamily:"Helvetica-Bold"},
  subtitle:{marginBottom:4,color:"#46516a"}, divider:{borderBottom:1,borderColor:"#dbd1ef",marginVertical:10},
  section:{marginTop:12,marginBottom:4,fontSize:12,fontFamily:"Helvetica-Bold",color:"#54249f"},
  row:{flexDirection:"row",borderBottom:0.5,borderColor:"#e8e5f1"},
  header:{backgroundColor:"#f0e8ff",fontFamily:"Helvetica-Bold"},
  cell:{flex:1,padding:5,lineHeight:1.3},
  kpis:{flexDirection:"row",flexWrap:"wrap",marginBottom:6,gap:4},
  kpi:{width:"24%",padding:6,backgroundColor:"#f6f2fe",borderRadius:3},
  kpiVal:{fontSize:13,fontFamily:"Helvetica-Bold"},
  chart:{flexDirection:"row",gap:5,alignItems:"flex-end",height:65,marginTop:5},
  bar:{flex:1,alignItems:"center"},barFill:{backgroundColor:"#8a53ed",width:19,borderTopLeftRadius:2,borderTopRightRadius:2},
  chartLabel:{fontSize:7,marginTop:2}, footer:{position:"absolute",bottom:23,left:34,right:34,flexDirection:"row",justifyContent:"space-between",fontSize:8,color:"#677088"},
  signature:{marginTop:30,color:"#677088"},
});
export function AcademicPdf({report,demo=false}:{report:Report;demo?:boolean}){
  return <Document title={report.title} author={report.institution}><Page size="A4" style={s.page}>
    {report.logo&&<Image src={report.logo} style={{width:54,height:44,objectFit:"contain",marginBottom:6}}/>}
    <Text style={s.brand}>{report.institution}{demo?" · DEMONSTRATION":""}</Text><Text style={s.title}>{report.title}</Text>
    {report.person&&<Text style={s.subtitle}>{report.person}</Text>}
    <Text style={s.subtitle}>Academic year: {report.academicYear}</Text><Text style={s.subtitle}>Reporting period: {report.period}</Text><View style={s.divider}/>
    <View style={s.kpis}>{report.metrics.map(([label,value])=><View style={s.kpi} key={label} wrap={false}><Text style={s.kpiVal}>{value}</Text><Text>{label}</Text></View>)}</View>
    {report.trend.some(point=>point.Attendance!==null)&&<View wrap={false}><Text style={s.section}>Weekly attendance</Text><View style={s.chart}>{report.trend.map(row=><View key={row.date} style={s.bar}><Text style={s.chartLabel}>{row.Attendance===null?"":row.Attendance+"%"}</Text><View style={{...s.barFill,height:Math.max(0,(row.Attendance??0)*0.41)}}/><Text style={s.chartLabel}>{row.date}</Text></View>)}</View></View>}
    {report.sections.map(section=><View key={section.title}><Text style={s.section} minPresenceAhead={26}>{section.title}</Text><View style={[s.row,s.header]} wrap={false}>{section.headers.map(item=><Text key={item} style={s.cell}>{item}</Text>)}</View>{section.rows.length?section.rows.map((row,i)=><View style={s.row} wrap={false} key={i}>{row.map((cell,j)=><Text style={s.cell} key={j}>{cell.slice(0,700)}</Text>)}</View>):<Text style={s.cell}>No records for this period.</Text>}</View>)}
    <Text style={s.signature}>{report.signature??"Authorized signature"} __________________________</Text>
    <View style={s.footer} fixed><Text>Generated {report.generated} · Confidential academic report</Text><Text render={({pageNumber,totalPages})=>pageNumber+" / "+totalPages}/></View>
  </Page></Document>;
}
