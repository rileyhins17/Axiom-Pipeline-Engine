import {
  Check,
  CheckCircle2,
  Clock3,
  Cog,
  Database,
  Folder,
  Info,
  Send,
  Settings2,
  UserRoundPlus,
} from "lucide-react";

import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const kpis = [
  { label: "Total Leads", value: "1,250", delta: "+12%", period: "vs May 6 - May 12", color: "#62e79f", points: "2,4 18,1 34,3 50,0 66,5 82,5 98,4 114,6 130,2 146,8 162,3 178,9 194,5 210,14 226,6 242,11 258,4 274,9" },
  { label: "Contacts in Vault", value: "950", delta: "+9%", period: "vs May 6 - May 12", color: "#55c6dc", points: "2,7 18,5 34,8 50,6 66,4 82,7 98,4 114,9 130,5 146,7 162,2 178,5 194,10 210,3 226,8 242,4 258,9 274,5" },
  { label: "Active Outreach", value: "320", delta: "+15%", period: "vs May 6 - May 12", color: "#55c6dc", points: "2,9 18,6 34,7 50,10 66,7 82,3 98,9 114,4 130,8 146,6 162,1 178,4 194,8 210,3 226,9 242,5 258,7 274,2" },
  { label: "Responses", value: "109", delta: "+8%", period: "vs May 6 - May 12", color: "#62e79f", points: "2,8 18,4 34,5 50,6 66,2 82,9 98,8 114,6 130,7 146,3 162,6 178,4 194,8 210,5 226,13 242,6 258,9 274,3" },
  { label: "Meetings Booked", value: "27", delta: "+17%", period: "vs May 6 - May 12", color: "#f59e0b", points: "2,9 18,6 34,8 50,7 66,3 82,7 98,2 114,6 130,5 146,1 162,3 178,7 194,2 210,8 226,3 242,5 258,1 274,0" },
  { label: "Conversion Rate", value: "8.44%", delta: "+1.2pp", period: "vs May 6 - May 12", color: "#62e79f", points: "2,8 18,3 34,8 50,9 66,7 82,4 98,5 114,2 130,6 146,1 162,5 178,3 194,12 210,4 226,8 242,3 258,6 274,2" },
];

const actionQueue = [
  { action: "Review New Leads", detail: "105 new leads require review", item: "Lead Generator", priority: "High", due: "1h" },
  { action: "Enrich Contacts", detail: "230 contacts need enrichment", item: "Vault", priority: "Medium", due: "3h" },
  { action: "Follow Up", detail: "48 contacts waiting for follow up", item: "Outreach", priority: "High", due: "5h" },
  { action: "Workflow Alerts", detail: "2 workflows need attention", item: "Automation", priority: "Medium", due: "1d" },
  { action: "Data Quality", detail: "12 duplicates detected", item: "Data Quality", priority: "Low", due: "2d" },
];

const activity = [
  { icon: UserRoundPlus, tone: "green", title: "105 new leads generated", detail: "from LinkedIn Sales Navigator", time: "9:15 AM" },
  { icon: Folder, tone: "blue", title: "230 contacts imported to vault", detail: "from CSV upload", time: "8:42 AM" },
  { icon: Send, tone: "cyan", title: 'Campaign "Q2 Outreach" sent', detail: "to 320 recipients", time: "8:30 AM" },
  { icon: Database, tone: "green", title: "34 responses received", detail: "12% response rate", time: "7:45 AM" },
  { icon: Cog, tone: "amber", title: 'Workflow "Nurture Sequence" triggered', detail: "for 18 contacts", time: "6:20 AM" },
];

const campaigns = [
  ["Q2 Outreach", "48", "15.0%", "12"],
  ["Enterprise Follow Up", "32", "18.2%", "8"],
  ["Product Demo Invite", "18", "20.0%", "5"],
  ["Nurture Sequence", "11", "11.0%", "2"],
  ["Re-engagement May", "9", "9.8%", "1"],
];

function IconTile({
  children,
  tone,
  size = "lg",
}: {
  children: React.ReactNode;
  tone: "green" | "blue" | "cyan" | "amber";
  size?: "sm" | "lg";
}) {
  const styles = {
    green: "border-[#245f48] bg-[#123a32] text-[#62e79f]",
    blue: "border-[#20517d] bg-[#102d50] text-[#53a8ff]",
    cyan: "border-[#1e5b67] bg-[#102f3a] text-[#55c6dc]",
    amber: "border-[#6b4b13] bg-[#4a3412] text-[#f59e0b]",
  };
  return (
    <div
      className={`flex items-center justify-center border ${styles[tone]} ${
        size === "lg" ? "h-[60px] w-[60px] rounded-xl" : "h-9 w-9 rounded-md"
      }`}
    >
      {children}
    </div>
  );
}

function KpiCard({ item }: { item: (typeof kpis)[number] }) {
  return (
    <div className="rounded-md border border-[#24313c] bg-[#121b25] p-4">
      <div className="flex items-center justify-between text-sm text-[#9da8b4]">
        <span>{item.label}</span>
        <Info className="h-3.5 w-3.5" />
      </div>
      <div className="mt-5 flex items-end gap-3">
        <div className="text-[28px] font-semibold leading-none text-[#f2f5f8]">{item.value}</div>
        <div className="text-sm font-semibold text-[#62e79f]">{item.delta}</div>
      </div>
      <div className="mt-2 text-[13px] text-[#98a3af]">{item.period}</div>
      <svg className="mt-4 h-[22px] w-full overflow-visible" viewBox="0 0 276 18" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" points={item.points} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    </div>
  );
}

function Priority({ value }: { value: string }) {
  const color = value === "High" ? "text-[#ff6666]" : value === "Medium" ? "text-[#f59e0b]" : "text-[#62e79f]";
  return <span className={`text-[13px] font-medium ${color}`}>{value}</span>;
}

export default async function DashboardPage() {
  await requireSession();

  return (
    <div className="min-h-[calc(100vh-163px)] text-[#d9e0e8]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-white">Dashboard</h1>
          <p className="mt-1 text-[15px] text-[#b7c0cb]">Unified overview of your pipeline engine</p>
        </div>
        <div className="text-right">
          <div className="mb-3 text-sm text-[#9aa5b1]">Tuesday, May 13, 2025&nbsp;&nbsp; 9:41 AM</div>
          <div className="flex gap-3">
            <button className="flex h-9 items-center gap-2 rounded-md border border-[#2a3644] bg-[#182231] px-4 text-sm font-medium text-white" type="button">
              <Settings2 className="h-4 w-4" />
              Customize
            </button>
            <button className="flex h-9 min-w-[173px] items-center justify-between rounded-md border border-[#2a3644] bg-[#182231] px-4 text-sm font-medium text-white" type="button">
              This Week
              <span className="text-[#9aa5b1]">⌄</span>
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#24313c] bg-[#121b25] p-5">
        <h2 className="text-base font-semibold text-white">Pipeline Workflow</h2>
        <div className="mt-6 flex items-center justify-center gap-5">
          <div className="flex items-center gap-4">
            <IconTile tone="green"><UserRoundPlus className="h-8 w-8" /></IconTile>
            <div className="w-[128px]">
              <div className="font-semibold text-white">Lead Generator</div>
              <div className="mt-2 text-sm text-[#62e79f]">1,250 <span className="text-[#dce3ea]">Leads</span></div>
              <div className="text-sm text-[#62e79f]">+12% <span className="text-[#9aa5b1]">vs last week</span></div>
            </div>
          </div>
          <div className="h-px w-[58px] bg-[#53606d]" />
          <CheckCircle2 className="h-6 w-6 text-[#62e79f]" />
          <div className="h-px w-[38px] bg-[#53606d]" />
          <div className="flex items-center gap-4">
            <IconTile tone="blue"><Folder className="h-8 w-8" /></IconTile>
            <div className="w-[128px]">
              <div className="font-semibold text-white">Vault</div>
              <div className="mt-2 text-sm text-white">950 <span className="text-[#dce3ea]">Contacts</span></div>
              <div className="text-sm text-[#9aa5b1]">76% of leads captured</div>
            </div>
          </div>
          <div className="h-px w-[58px] bg-[#53606d]" />
          <CheckCircle2 className="h-6 w-6 text-[#62e79f]" />
          <div className="h-px w-[38px] bg-[#53606d]" />
          <div className="flex items-center gap-4">
            <IconTile tone="cyan"><Send className="h-8 w-8" /></IconTile>
            <div className="w-[128px]">
              <div className="font-semibold text-white">Outreach</div>
              <div className="mt-2 text-sm text-white">320 <span className="text-[#dce3ea]">Active</span></div>
              <div className="text-sm text-[#9aa5b1]">34% response rate</div>
            </div>
          </div>
          <div className="h-px w-[58px] bg-[#53606d]" />
          <Clock3 className="h-6 w-6 text-[#f59e0b]" />
          <div className="h-px w-[38px] bg-[#53606d]" />
          <div className="flex items-center gap-4">
            <IconTile tone="amber"><Cog className="h-8 w-8" /></IconTile>
            <div className="w-[128px]">
              <div className="font-semibold text-white">Automation</div>
              <div className="mt-2 text-sm text-white">18 <span className="text-[#dce3ea]">Workflows</span></div>
              <div className="text-sm text-[#9aa5b1]">5 running now</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-6 gap-4">
        {kpis.map((item) => <KpiCard key={item.label} item={item} />)}
      </section>

      <section className="mt-4 grid grid-cols-[1.15fr_0.9fr_1.03fr] gap-4">
        <div className="rounded-md border border-[#24313c] bg-[#121b25]">
          <div className="flex h-[59px] items-center justify-between border-b border-[#24313c] px-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-white">Action Queue</h2>
              <span className="rounded-md bg-[#26313d] px-2 py-0.5 text-sm font-semibold text-[#c7d0da]">7</span>
            </div>
            <button className="text-sm text-[#55a7ff]" type="button">View All</button>
          </div>
          <div className="grid grid-cols-[36px_1.6fr_0.72fr_0.7fr_44px] border-b border-[#24313c] px-4 py-3 text-[12px] text-[#9aa5b1]">
            <span className="h-3 w-3 rounded-sm bg-[#202b36]" />
            <span>Action</span>
            <span>Item</span>
            <span>Priority</span>
            <span>Due</span>
          </div>
          {actionQueue.map((item) => (
            <div key={item.action} className="grid grid-cols-[36px_1.6fr_0.72fr_0.7fr_44px] items-center border-b border-[#24313c] px-4 py-[9px] text-sm">
              <span className="h-4 w-4 rounded border border-[#53606d]" />
              <div>
                <div className="font-medium text-white">{item.action}</div>
                <div className="text-[12px] text-[#8f9aa6]">{item.detail}</div>
              </div>
              <span className="text-[13px] text-[#a9b3bf]">{item.item}</span>
              <Priority value={item.priority} />
              <span className="text-[13px] text-[#a9b3bf]">{item.due}</span>
            </div>
          ))}
          <div className="flex h-[69px] items-center justify-between px-4">
            <span className="text-sm text-[#a9b3bf]">7 actions</span>
            <button className="flex h-9 items-center gap-2 rounded-md border border-[#364253] bg-[#17212d] px-4 text-sm font-medium text-white" type="button">
              <Check className="h-4 w-4" />
              Mark All Complete
            </button>
          </div>
        </div>

        <div className="rounded-md border border-[#24313c] bg-[#121b25]">
          <div className="flex h-[59px] items-center px-4">
            <h2 className="text-base font-semibold text-white">Recent Activity</h2>
          </div>
          <div className="space-y-0 px-4">
            {activity.map((item) => (
              <div key={item.title} className="flex items-center gap-3 border-b border-[#24313c] py-[13px]">
                <IconTile tone={item.tone as "green" | "blue" | "cyan" | "amber"} size="sm">
                  <item.icon className="h-5 w-5" />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{item.title}</div>
                  <div className="text-sm text-[#8f9aa6]">{item.detail}</div>
                </div>
                <div className="text-[13px] text-[#9aa5b1]">{item.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-[#24313c] bg-[#121b25]">
          <div className="flex h-[59px] items-center justify-between border-b border-[#24313c] px-5">
            <h2 className="text-base font-semibold text-white">Top Performing Campaigns</h2>
            <button className="text-sm text-[#55a7ff]" type="button">View All</button>
          </div>
          <div className="grid grid-cols-[1.35fr_0.6fr_0.55fr_0.55fr] border-b border-[#24313c] px-5 py-3 text-[12px] text-[#9aa5b1]">
            <span>Campaign</span>
            <span>Responses</span>
            <span>Rate</span>
            <span>Meetings</span>
          </div>
          {campaigns.map((row) => (
            <div key={row[0]} className="grid grid-cols-[1.35fr_0.6fr_0.55fr_0.55fr] border-b border-[#24313c] px-5 py-[15px] text-sm">
              <span className="font-medium text-white">{row[0]}</span>
              <span className="text-[#d9e0e8]">{row[1]}</span>
              <span className="text-[#d9e0e8]">{row[2]}</span>
              <span className="text-[#d9e0e8]">{row[3]}</span>
            </div>
          ))}
          <div className="p-4">
            <button className="flex h-9 w-full items-center justify-between rounded-md border border-[#2a3644] bg-[#151f2b] px-3 text-sm font-medium text-white" type="button">
              View All Campaigns
              <span className="text-lg leading-none">→</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
