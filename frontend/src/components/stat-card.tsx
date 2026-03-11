interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  tooltip?: string
}

export const StatCard = ({ label, value, icon }: StatCardProps) => (
  <div className="bg-slate-800 rounded-xl p-4 h-full flex flex-col justify-between min-h-[5rem]">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="text-2xl font-bold text-slate-100 tabular-nums">{value}</span>
    </div>
    <p className="text-xs text-slate-400 mt-2 leading-tight">{label}</p>
  </div>
)
