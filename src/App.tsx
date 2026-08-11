import { useMemo, useState } from 'react'
import {
  LayoutDashboard, FileText, Users, CalendarDays, Send, BookOpen, Settings,
  Search, Bell, Plus, ArrowUpRight, Clock3, CircleCheck, CircleAlert, Sparkles,
  ChevronDown, MoreHorizontal, GripVertical, MapPin, Video, Upload,
  Mail, Check, X, Eye, ExternalLink, PanelLeftClose, Menu, WandSparkles,
  ListFilter, Download, CalendarPlus, UserRoundCheck, ClipboardCheck, Globe2,
} from 'lucide-react'
import './App.css'

type View = 'dashboard' | 'submissions' | 'speakers' | 'agenda' | 'communications' | 'portal' | 'gallery'
type Submission = { id:number; title:string; speaker:string; initials:string; track:string; format:string; score:number; status:'Accepted'|'In review'|'Waitlist'; color:string }

const submissions: Submission[] = [
  {id:1,title:'Beyond the chatbot: building reliable AI agents',speaker:'Maya Chen',initials:'MC',track:'Agents & orchestration',format:'Talk · 30 min',score:4.8,status:'Accepted',color:'#7065e8'},
  {id:2,title:'Evaluating LLM systems in production',speaker:'Owen Wallace',initials:'OW',track:'Evaluation',format:'Talk · 30 min',score:4.6,status:'Accepted',color:'#168a77'},
  {id:3,title:'Small models, big impact: edge AI in practice',speaker:'Priya Rao',initials:'PR',track:'Applied AI',format:'Talk · 20 min',score:4.2,status:'In review',color:'#df7a54'},
  {id:4,title:'The open-source inference stack',speaker:'Jon Bell',initials:'JB',track:'Infrastructure',format:'Panel · 45 min',score:3.9,status:'Waitlist',color:'#2784b8'},
  {id:5,title:'Designing human-centered AI products',speaker:'Amelia Hart',initials:'AH',track:'Product & design',format:'Workshop · 60 min',score:4.7,status:'Accepted',color:'#bd5a88'},
]

const agenda = [
  {time:'9:00',room:'Main stage',title:'Opening keynote: The next era of AI engineering',speaker:'Maya Chen',track:'Keynote',tone:'violet'},
  {time:'10:00',room:'Main stage',title:'Beyond the chatbot: building reliable AI agents',speaker:'Maya Chen',track:'Agents',tone:'violet'},
  {time:'10:00',room:'Studio A',title:'Evaluating LLM systems in production',speaker:'Owen Wallace',track:'Evaluation',tone:'green'},
  {time:'11:00',room:'Main stage',title:'The open-source inference stack',speaker:'Jon Bell + 3',track:'Infrastructure',tone:'blue'},
  {time:'11:00',room:'Studio A',title:'Designing human-centered AI products',speaker:'Amelia Hart',track:'Product',tone:'orange'},
]

const nav = [
  {id:'dashboard',label:'Overview',icon:LayoutDashboard}, {id:'submissions',label:'Submissions',icon:FileText,badge:'24'},
  {id:'speakers',label:'Speakers',icon:Users}, {id:'agenda',label:'Agenda',icon:CalendarDays},
  {id:'communications',label:'Communications',icon:Send}, {id:'portal',label:'Speaker portal',icon:BookOpen},
] as const

function Avatar({initials,color='#6f62df',small=false}:{initials:string;color?:string;small?:boolean}) {
  return <span className={`avatar ${small?'small':''}`} style={{background:color}}>{initials}</span>
}
function Badge({children,tone='gray'}:{children:React.ReactNode;tone?:string}) { return <span className={`badge ${tone}`}>{children}</span> }
function Progress({value,color='#6d5fda'}:{value:number;color?:string}) { return <div className="progress"><i style={{width:`${value}%`,background:color}} /></div> }

export default function App() {
  const [view,setView] = useState<View>('dashboard'); const [sidebar,setSidebar]=useState(true)
  const [toast,setToast]=useState(''); const [search,setSearch]=useState(''); const [modal,setModal]=useState('')
  const title = nav.find(n=>n.id===view)?.label || (view==='gallery'?'Public event page':'Overview')
  const filtered = useMemo(()=>submissions.filter(s=>(s.title+s.speaker+s.track).toLowerCase().includes(search.toLowerCase())),[search])
  const notify=(message:string)=>{setToast(message);setTimeout(()=>setToast(''),2600)}
  return <div className="app">
    <aside className={sidebar?'':'collapsed'}>
      <div className="brand"><div className="brandmark"><span/><span/><span/></div>{sidebar&&<b>OpenSpeaker</b>}</div>
      <div className="event-switch"><div className="event-logo">AI</div>{sidebar&&<><span><b>AI Engineer Summit</b><small>San Francisco · 2026</small></span><ChevronDown size={15}/></>}</div>
      <nav>{nav.map(n=><button key={n.id} className={view===n.id?'active':''} onClick={()=>setView(n.id as View)} title={n.label}><n.icon size={19}/>{sidebar&&<><span>{n.label}</span>{'badge'in n&&<em>{n.badge}</em>}</>}</button>)}</nav>
      <div className="aside-bottom"><button onClick={()=>setView('gallery')}><Globe2 size={19}/>{sidebar&&<span>Public event page</span>}</button><button><Settings size={19}/>{sidebar&&<span>Settings</span>}</button><div className="profile"><Avatar initials="SL" small/>{sidebar&&<span><b>Sarah Lin</b><small>Event organizer</small></span>}</div></div>
    </aside>
    <main>
      <header><button className="icon-btn" onClick={()=>setSidebar(!sidebar)}>{sidebar?<PanelLeftClose size={20}/>:<Menu size={20}/>}</button><div className="crumb"><span>AI Engineer Summit</span><b>/</b><strong>{title}</strong></div><div className="header-actions"><label className="global-search"><Search size={17}/><input aria-label="Global search" placeholder="Search anything..." value={search} onChange={e=>setSearch(e.target.value)}/><kbd>⌘ K</kbd></label><button className="icon-btn notification"><Bell size={19}/><i/></button><Avatar initials="SL" small/></div></header>
      <section className="content">
        {view==='dashboard'&&<Dashboard setView={setView} notify={notify}/>} 
        {view==='submissions'&&<Submissions items={filtered} notify={notify} setModal={setModal}/>} 
        {view==='speakers'&&<Speakers notify={notify}/>} 
        {view==='agenda'&&<Agenda notify={notify}/>} 
        {view==='communications'&&<Communications notify={notify}/>} 
        {view==='portal'&&<Portal notify={notify}/>} 
        {view==='gallery'&&<PublicPage setView={setView}/>} 
      </section>
    </main>
    {toast&&<div className="toast"><CircleCheck size={18}/>{toast}</div>}
    {modal&&<Modal type={modal} close={()=>setModal('')} notify={notify}/>} 
  </div>
}

function PageHead({eyebrow,title,copy,actions}:{eyebrow?:string,title:string;copy:string;actions?:React.ReactNode}) {return <div className="page-head"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{copy}</p></div><div className="page-actions">{actions}</div></div>}

function Dashboard({setView,notify}:{setView:(v:View)=>void;notify:(s:string)=>void}) {return <>
  <PageHead eyebrow="TUESDAY, AUGUST 11" title="Good morning, Sarah" copy="Here’s what’s happening with your event today." actions={<><button className="secondary" onClick={()=>setView('gallery')}><Eye size={17}/>Preview event</button><button className="primary" onClick={()=>notify('Submission form link copied')}><Plus size={17}/>Create submission form</button></>}/>
  <div className="metrics">
    <Metric icon={<FileText/>} label="Total submissions" value="124" trend="+18 this week" tone="violet"/>
    <Metric icon={<UserRoundCheck/>} label="Confirmed speakers" value="38" trend="84% response rate" tone="green"/>
    <Metric icon={<ClipboardCheck/>} label="Tasks completed" value="73%" progress={73} tone="blue"/>
    <Metric icon={<CalendarDays/>} label="Sessions scheduled" value="42 / 48" trend="6 need a time slot" tone="orange"/>
  </div>
  <div className="dash-grid"><div className="panel span2"><PanelHead title="Onboarding progress" sub="Speaker tasks across your event" action="View all speakers" onClick={()=>setView('speakers')}/>
    <div className="onboarding"><div className="ring"><div><b>73%</b><span>complete</span></div></div><div className="task-bars">
      <TaskBar label="Speaker agreement" value={35} total={38} color="#7064df"/><TaskBar label="Bio & headshot" value={31} total={38} color="#18917c"/><TaskBar label="Session details" value={27} total={38} color="#e48b59"/><TaskBar label="Slides uploaded" value={18} total={38} color="#d55e8e"/>
    </div></div></div>
    <div className="panel"><PanelHead title="Needs attention" sub="Outstanding actions"/><div className="attention">
      <Attention icon={<CircleAlert/>} count="7" text="speakers missing headshots" tone="orange"/><Attention icon={<Clock3/>} count="12" text="tasks overdue" tone="red"/><Attention icon={<FileText/>} count="5" text="submissions unreviewed" tone="violet"/>
    </div><button className="text-btn" onClick={()=>setView('speakers')}>Review outstanding items <ArrowUpRight size={15}/></button></div>
  </div>
  <div className="dash-grid lower"><div className="panel span2"><PanelHead title="Recent submissions" sub="Latest proposals from your call for speakers" action="View all" onClick={()=>setView('submissions')}/><SubmissionTable items={submissions.slice(0,3)}/></div>
    <div className="panel"><PanelHead title="Upcoming deadlines" action="View calendar"/><div className="deadlines"><DateItem month="AUG" day="14" title="Speaker confirmations" detail="3 days remaining"/><DateItem month="AUG" day="21" title="Final session details" detail="10 days remaining"/><DateItem month="SEP" day="02" title="Slides due" detail="22 days remaining"/></div></div></div>
  </>}

function Metric({icon,label,value,trend,tone,progress}:{icon:React.ReactNode,label:string,value:string,trend?:string,tone:string,progress?:number}) {return <div className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><b>{value}</b>{progress!==undefined?<Progress value={progress}/>:<small>{trend}</small>}</div><button><MoreHorizontal size={17}/></button></div>}
function PanelHead({title,sub,action,onClick}:{title:string;sub?:string;action?:string;onClick?:()=>void}) {return <div className="panel-head"><div><h3>{title}</h3>{sub&&<p>{sub}</p>}</div>{action&&<button onClick={onClick}>{action}<ArrowUpRight size={14}/></button>}</div>}
function TaskBar({label,value,total,color}:{label:string;value:number;total:number;color:string}) {return <div className="taskbar"><div><span>{label}</span><b>{value} <small>/ {total}</small></b></div><Progress value={value/total*100} color={color}/></div>}
function Attention({icon,count,text,tone}:{icon:React.ReactNode;count:string;text:string;tone:string}) {return <div className="attention-row"><span className={`attention-icon ${tone}`}>{icon}</span><div><b>{count}</b><small>{text}</small></div><ArrowUpRight size={16}/></div>}
function DateItem({month,day,title,detail}:{month:string;day:string;title:string;detail:string}) {return <div className="date-item"><div><span>{month}</span><b>{day}</b></div><p><b>{title}</b><small>{detail}</small></p></div>}

function Submissions({items,notify,setModal}:{items:Submission[];notify:(s:string)=>void;setModal:(s:string)=>void}) {const [filter,setFilter]=useState('All');return <>
  <PageHead title="Submissions" copy="Review, score, and advance proposals through your workflow." actions={<><button className="secondary" onClick={()=>notify('CSV export downloaded')}><Download size={17}/>Export</button><button className="primary" onClick={()=>setModal('submission')}><Plus size={17}/>New submission</button></>}/>
  <div className="tabs">{['All','Needs review','Accepted','Waitlist','Declined'].map((x,i)=><button className={filter===x?'active':''} onClick={()=>setFilter(x)} key={x}>{x}<span>{[124,24,38,12,50][i]}</span></button>)}</div>
  <div className="table-tools"><div><button className="filter-btn"><ListFilter size={16}/>Track: All<ChevronDown size={14}/></button><button className="filter-btn">Round: Final<ChevronDown size={14}/></button></div><span>{items.length} shown</span></div>
  <div className="table-card"><SubmissionTable items={items} full notify={notify}/></div>
  </>}
function SubmissionTable({items,full=false,notify}:{items:Submission[];full?:boolean;notify?:(s:string)=>void}) {return <div className="table-wrap"><table><thead><tr><th>Submission</th><th>Track</th>{full&&<th>Format</th>}<th>Score</th><th>Status</th>{full&&<th/>}</tr></thead><tbody>{items.map(s=><tr key={s.id}><td><div className="person"><Avatar initials={s.initials} color={s.color} small/><p><b>{s.title}</b><small>{s.speaker}</small></p></div></td><td><Badge>{s.track}</Badge></td>{full&&<td>{s.format}</td>}<td><b className="score">★ {s.score}</b></td><td><Badge tone={s.status==='Accepted'?'green':s.status==='Waitlist'?'orange':'violet'}>{s.status}</Badge></td>{full&&<td><button className="icon-btn" onClick={()=>notify?.(`${s.title} opened`)}><MoreHorizontal size={18}/></button></td>}</tr>)}</tbody></table></div>}

function Speakers({notify}:{notify:(s:string)=>void}) {const people=[['Maya Chen','MC','Keynote · Agents','Complete',100,'#7065e8'],['Owen Wallace','OW','Evaluation','2 tasks due',67,'#168a77'],['Priya Rao','PR','Applied AI','1 task due',82,'#df7a54'],['Jon Bell','JB','Infrastructure','Overdue',45,'#2784b8'],['Amelia Hart','AH','Product & design','Complete',100,'#bd5a88'],['Leo Martins','LM','Developer tools','3 tasks due',32,'#6f7e91']];return <>
  <PageHead title="Speakers" copy="Keep every speaker on track, from acceptance to showtime." actions={<button className="primary" onClick={()=>notify('Speaker invitation sent')}><Plus size={17}/>Invite speaker</button>}/>
  <div className="summary-strip"><div><span className="dot green"/><b>38</b><small>Confirmed</small></div><div><span className="dot orange"/><b>19</b><small>Tasks outstanding</small></div><div><span className="dot red"/><b>8</b><small>Overdue</small></div><button className="secondary" onClick={()=>notify('Reminder sent to 19 speakers')}><Send size={16}/>Remind all</button></div>
  <div className="speaker-grid">{people.map(p=><div className="speaker-card" key={p[0] as string}><div className="speaker-top"><Avatar initials={p[1] as string} color={p[5] as string}/><button className="icon-btn"><MoreHorizontal size={18}/></button></div><h3>{p[0]}</h3><p>{p[2]}</p><div className="completion"><span>Onboarding</span><b>{p[4]}%</b></div><Progress value={p[4] as number} color={(p[4] as number)<50?'#e26767':'#7064df'}/><div className="speaker-foot"><Badge tone={p[3]==='Complete'?'green':p[3]==='Overdue'?'red':'orange'}>{p[3]}</Badge><button onClick={()=>notify(`Message sent to ${p[0]}`)}><Mail size={15}/></button></div></div>)}</div>
  </>}

function Agenda({notify}:{notify:(s:string)=>void}) {const [mode,setMode]=useState('Day');return <>
  <PageHead title="Agenda builder" copy="Build your program and spot scheduling conflicts instantly." actions={<><button className="secondary"><WandSparkles size={17}/>Auto-schedule</button><button className="primary" onClick={()=>notify('Agenda published to event page')}><Globe2 size={17}/>Publish agenda</button></>}/>
  <div className="agenda-tools"><div className="segmented">{['List','Day','Track','Room'].map(x=><button key={x} className={mode===x?'active':''} onClick={()=>setMode(x)}>{x}</button>)}</div><div><button className="filter-btn"><CalendarDays size={16}/>September 16, 2026<ChevronDown size={14}/></button><button className="filter-btn"><Eye size={16}/>Conflicts: 1</button></div></div>
  <div className="agenda-layout"><div className="unscheduled"><h3>Unscheduled <Badge>6</Badge></h3><p>Drag sessions onto the agenda</p>{submissions.slice(2).map(s=><div key={s.id} className="drag-card" draggable onDragEnd={()=>notify('Session ready to schedule')}><GripVertical size={16}/><div><b>{s.title}</b><small>{s.speaker} · {s.format}</small></div></div>)}</div>
  <div className="calendar"><div className="cal-head"><span>TIME</span><b>Main stage</b><b>Studio A</b></div>{['9:00','10:00','11:00','12:00'].map(time=><div key={time} className="cal-row"><span>{time} AM</span>{['Main stage','Studio A'].map(room=>{const item=agenda.find(a=>a.time===time&&a.room===room);return <div key={room} className="cal-cell">{item&&<div className={`session ${item.tone}`}><Badge>{item.track}</Badge><b>{item.title}</b><small><Users size={13}/>{item.speaker}</small><small><MapPin size={13}/>{room}</small></div>}</div>})}</div>)}</div></div>
  </>}

function Communications({notify}:{notify:(s:string)=>void}) {return <><PageHead title="Communications" copy="Send timely, personalized updates without chasing spreadsheets." actions={<button className="primary" onClick={()=>notify('New campaign draft created')}><Plus size={17}/>New message</button>}/>
  <div className="comm-layout"><div className="panel templates"><PanelHead title="Automations" sub="Messages triggered by your workflow"/><Automation title="Acceptance email" trigger="When submission is accepted" sent="38 sent" active/><Automation title="Onboarding reminder" trigger="3 days before task deadline" sent="19 sent" active/><Automation title="Calendar invitation" trigger="When a session is scheduled" sent="42 sent" active/><Automation title="Slide deadline reminder" trigger="7 days before event" sent="Scheduled"/></div>
  <div className="panel composer"><div className="compose-icon"><Mail/></div><h2>Keep speakers in the loop</h2><p>Use smart fields and templates to send a personal message to one speaker—or hundreds.</p><div className="mock-message"><span>To <Badge>Speakers with overdue tasks · 8</Badge></span><b>{'Friendly reminder: {{ task.name }} is due'}</b><p>Hi <mark>{'{{ speaker.first_name }}'}</mark>, just a quick reminder to complete your event profile...</p></div><button className="secondary" onClick={()=>notify('Template library opened')}><Sparkles size={16}/>Browse templates</button></div></div></>}
function Automation({title,trigger,sent,active=false}:{title:string;trigger:string;sent:string;active?:boolean}) {return <div className="automation"><span className={`auto-icon ${active?'active':''}`}><Send size={17}/></span><div><b>{title}</b><small>{trigger}</small></div><Badge tone={sent==='Scheduled'?'orange':'green'}>{sent}</Badge><label className={`toggle ${active?'on':''}`}><i/></label></div>}

function Portal({notify}:{notify:(s:string)=>void}) {return <><PageHead eyebrow="SPEAKER VIEW" title="Welcome back, Maya" copy="You’re almost ready for AI Engineer Summit." actions={<button className="secondary"><ExternalLink size={16}/>View public profile</button>}/>
  <div className="portal-hero"><div><Badge tone="violet">AI ENGINEER SUMMIT</Badge><h2>Your speaker checklist</h2><p>Complete the remaining items by <b>August 21</b>.</p></div><div className="big-progress"><b>75%</b><Progress value={75}/><span>3 of 4 tasks complete</span></div></div>
  <div className="portal-grid"><div className="panel"><PanelHead title="Your tasks"/><PortalTask title="Sign speaker agreement" detail="Completed August 4" done/><PortalTask title="Add bio and headshot" detail="Completed August 6" done/><PortalTask title="Confirm session details" detail="Completed August 9" done/><PortalTask title="Upload presentation slides" detail="Due August 21 · PDF, PPTX or Keynote" action={()=>notify('File picker opened')}/></div>
  <div className="panel resources"><PanelHead title="Event resources"/><Resource icon={<MapPin/>} title="Venue & arrival guide"/><Resource icon={<Video/>} title="AV and presentation tips"/><Resource icon={<CalendarPlus/>} title="Add event to calendar"/><Resource icon={<BookOpen/>} title="Speaker handbook"/></div></div></>}
function PortalTask({title,detail,done,action}:{title:string;detail:string;done?:boolean;action?:()=>void}) {return <div className="portal-task"><span className={done?'done':''}>{done?<Check size={17}/>:<Clock3 size={17}/>}</span><div><b>{title}</b><small>{detail}</small></div>{!done&&<button className="primary mini" onClick={action}><Upload size={14}/>Upload</button>}</div>}
function Resource({icon,title}:{icon:React.ReactNode;title:string}) {return <button className="resource"><span>{icon}</span><b>{title}</b><ArrowUpRight size={16}/></button>}

function PublicPage({setView}:{setView:(v:View)=>void}) {return <div className="public-page"><div className="public-nav"><div className="public-brand">AI <b>ENGINEER</b></div><div><button>Speakers</button><button>Agenda</button><button>Venue</button><button className="public-cta">Get tickets <ArrowUpRight size={15}/></button></div></div><div className="public-hero"><Badge>SEPT 16–17 · SAN FRANCISCO</Badge><h1>Meet the people<br/>building what’s next.</h1><p>Two days of practical insights from the engineers, researchers, and product leaders shaping the future of AI.</p><button className="public-cta" onClick={()=>setView('agenda')}>Explore the agenda <ArrowUpRight size={16}/></button></div><div className="public-speakers"><div><span>FEATURED SPEAKERS</span><h2>Learn from the best<br/>in the field.</h2></div>{submissions.slice(0,4).map((s,i)=><div key={s.id} className={`public-person pic${i}`}><div className="portrait">{s.initials}</div><h3>{s.speaker}</h3><p>{i%2?'AI Research Lead':'Founder & CEO'}</p></div>)}</div></div>}

function Modal({type,close,notify}:{type:string;close:()=>void;notify:(s:string)=>void}) {return <div className="modal-backdrop" onMouseDown={close}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" onClick={close}><X/></button><div className="modal-icon"><FileText/></div><h2>{type==='submission'?'Add a submission':'Create form'}</h2><p>Capture a new proposal and route it to the right review team.</p><label>Session title<input placeholder="Enter a clear, compelling title"/></label><label>Speaker email<input placeholder="speaker@company.com" type="email"/></label><div className="form-row"><label>Track<select><option>Agents & orchestration</option><option>Evaluation</option><option>Infrastructure</option></select></label><label>Format<select><option>Talk · 30 min</option><option>Workshop · 60 min</option></select></label></div><div className="modal-actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={()=>{close();notify('Submission added successfully')}}>Add submission</button></div></div></div>}

