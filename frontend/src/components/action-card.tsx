import { Link } from 'react-router-dom'

interface ActionCardProps {
  to: string
  icon: React.ReactNode
  label: string
  variant?: 'default' | 'primary'
}

export const ActionCard = ({ to, icon, label, variant = 'default' }: ActionCardProps) => {
  const styles = {
    default:
      'bg-slate-800 hover:bg-slate-700',
    primary:
      'bg-brand-900/40 border border-brand-700/50 hover:bg-brand-900/60',
  }

  return (
    <Link
      to={to}
      className={`${styles[variant]} rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors min-h-[5.5rem]`}
    >
      {icon}
      <span className={`text-sm font-medium ${variant === 'primary' ? 'text-brand-300' : 'text-slate-200'}`}>
        {label}
      </span>
    </Link>
  )
}
