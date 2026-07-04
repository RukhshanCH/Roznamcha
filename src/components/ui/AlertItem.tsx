import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert"
import { alertAtom } from "@/store/atoms";
import { useAtom } from "jotai";

interface AlertItemProps {
  message: string;
  type: 'success' | 'error' | 'info';
}

const AlertItem = ({ message, type }: AlertItemProps) => {
  const [alert,] = useAtom(alertAtom);

  return (
    <div>
      {alert && (
        <Alert className={`custom-alert ${type}`}>
          <AlertTitle className="alert-title">
            {type == "success" ? "کامیابی" : type == "error" ? "خرابی" : "معلومات"}
          </AlertTitle>
          <AlertDescription className="alert-description">
            {message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export default AlertItem
