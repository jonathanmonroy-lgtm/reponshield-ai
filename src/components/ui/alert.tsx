import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
} from "lucide-react";

type AlertVariant = "info" | "success" | "warning" | "error";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

const config: Record<
  AlertVariant,
  { icon: React.ReactNode; container: string; title: string }
> = {
  info: {
    icon: <Info className="h-5 w-5 text-blue-500" />,
    container: "border-blue-200 bg-blue-50",
    title: "text-blue-800",
  },
  success: {
    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    container: "border-green-200 bg-green-50",
    title: "text-green-800",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
    container: "border-yellow-200 bg-yellow-50",
    title: "text-yellow-800",
  },
  error: {
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    container: "border-red-200 bg-red-50",
    title: "text-red-800",
  },
};

export function Alert({
  variant = "info",
  title,
  className,
  children,
  ...props
}: AlertProps) {
  const cfg = config[variant];
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-4",
        cfg.container,
        className
      )}
      role="alert"
      {...props}
    >
      <span className="shrink-0 mt-0.5">{cfg.icon}</span>
      <div className="flex flex-col gap-1">
        {title && (
          <p className={cn("text-sm font-semibold", cfg.title)}>{title}</p>
        )}
        {children && (
          <div className="text-sm text-gray-700">{children}</div>
        )}
      </div>
    </div>
  );
}
