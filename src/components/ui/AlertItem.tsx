import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert"
import { alertAtom } from "@/store/atoms";
import { useAtom } from "jotai";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

interface AlertItemProps {
  message: string;
  type: 'success' | 'error' | 'info';
}

const AlertItem = ({ message, type }: AlertItemProps) => {
  const [alert,] = useAtom(alertAtom);
  const Icon = type === "success" ? CircleCheck : type === "error" ? CircleAlert : Info;
  const title = type === "success" ? "کامیابی" : type === "error" ? "خرابی" : "معلومات";

  return (
    <div>
      {alert && (
        <Alert className={`custom-alert ${type}`} aria-live="polite">
          <span className="alert-icon" aria-hidden="true">
            <Icon size={20} strokeWidth={2.25} />
          </span>
          <div className="alert-content">
            <AlertTitle className="alert-title">{title}</AlertTitle>
            <AlertDescription className="alert-description">{message}</AlertDescription>
          </div>
        </Alert>
      )}
    </div>
  )
}

export default AlertItem
