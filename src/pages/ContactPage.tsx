import { useState } from "react";
import {
  MessageSquare,
  Lightbulb,
  AlertCircle,
  Mail,
  Phone,
  Send,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

type QueryType = "query" | "suggestion" | "complaint";

interface FormState {
  name: string;
  email: string;
  phone: string;
  queryType: QueryType;
  subject: string;
  message: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  queryType: "query",
  subject: "",
  message: "",
};

const QUERY_TYPES: { value: QueryType; label: string; urdu: string; icon: React.ReactNode; color: string }[] = [
  { value: "query",      label: "Query",      urdu: "سوال / استفسار", icon: <MessageSquare size={18} />, color: "#3b82f6" },
  { value: "suggestion", label: "Suggestion", urdu: "تجویز",          icon: <Lightbulb     size={18} />, color: "#f59e0b" },
  { value: "complaint",  label: "Complaint",  urdu: "شکایت",          icon: <AlertCircle   size={18} />, color: "#ef4444" },
];

export default function ContactPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const validate = () => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim())    newErrors.name = "Name is required";
    if (!form.email.trim())   newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = "Enter a valid email address";
    if (!form.subject.trim()) newErrors.subject = "Subject is required";
    if (!form.message.trim()) newErrors.message = "Message is required";
    else if (form.message.trim().length < 20) newErrors.message = "Message must be at least 20 characters";
    return newErrors;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormState]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return; }
    const subject = encodeURIComponent(`[${form.queryType.toUpperCase()}] ${form.subject}`);
    const body    = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone || "N/A"}\nType: ${form.queryType}\n\n${form.message}`);
    window.location.href = `mailto:support@roznamcha.app?subject=${subject}&body=${body}`;
    setSubmitted(true);
    setForm(INITIAL_FORM);
    setErrors({});
  };

  const activeType = QUERY_TYPES.find(t => t.value === form.queryType)!;

  return (
    <div dir="ltr" className="contact-container">
      <style>{`
        .contact-container { max-width:820px; margin:0 auto; font-family:system-ui,-apple-system,sans-serif; padding-bottom:40px; }
        .contact-header { margin-bottom:28px; }
        .contact-header h2 { font-size:26px; font-weight:700; color:#1f2937; margin:0 0 6px 0; display:flex; align-items:center; gap:10px; }
        .contact-header p { color:#6b7280; margin:0; font-size:15px; }
        .contact-card { background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:28px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
        .card-title { font-size:13px; font-weight:600; color:#374151; margin:0 0 20px 0; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #f3f4f6; padding-bottom:12px; }
        .query-type-group { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px; }
        .query-type-btn { display:flex; align-items:center; gap:8px; padding:10px 18px; border-radius:10px; border:2px solid #e5e7eb; background:#f9fafb; cursor:pointer; font-size:14px; font-weight:500; color:#6b7280; transition:all 0.2s; flex:1; min-width:120px; justify-content:center; }
        .query-type-btn:hover { border-color:#d1d5db; background:#f3f4f6; }
        .query-type-btn.active-query { border-color:var(--qcolor); background:color-mix(in srgb,var(--qcolor) 8%,white); color:var(--qcolor); font-weight:600; }
        .query-type-btn .urdu-sub { font-size:11px; display:block; line-height:1; opacity:0.75; font-family:'Noto Nastaliq Urdu',serif; direction:rtl; }
        .query-type-btn .btn-inner { display:flex; flex-direction:column; align-items:flex-start; gap:3px; }
        .form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; }
        .form-group { display:flex; flex-direction:column; gap:5px; }
        .form-group.full-width { grid-column:1/-1; }
        .form-label { font-size:13px; font-weight:600; color:#374151; text-transform:uppercase; letter-spacing:0.3px; }
        .form-label .required { color:#ef4444; margin-left:2px; }
        .input-field { padding:9px 13px; border:1.5px solid #d1d5db; border-radius:8px; font-size:14.5px; outline:none; color:#111827; background:#fff; transition:border-color 0.2s,box-shadow 0.2s; width:100%; box-sizing:border-box; }
        .input-field:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,0.12); }
        .input-field.error { border-color:#ef4444; box-shadow:0 0 0 3px rgba(239,68,68,0.1); }
        .textarea-field { resize:vertical; min-height:130px; font-family:inherit; }
        .field-error { font-size:12px; color:#dc2626; margin-top:2px; }
        .char-count { font-size:11px; color:#9ca3af; text-align:right; margin-top:2px; }
        .form-footer { display:flex; align-items:center; justify-content:flex-end; gap:14px; margin-top:8px; flex-wrap:wrap; }
        .submit-btn { display:inline-flex; align-items:center; gap:8px; padding:11px 26px; border-radius:10px; background:#3b82f6; color:white; font-size:15px; font-weight:600; cursor:pointer; border:none; transition:background 0.2s,transform 0.1s; }
        .submit-btn:hover { background:#2563eb; }
        .submit-btn:active { transform:scale(0.98); }
        .success-banner { display:flex; align-items:flex-start; gap:14px; padding:18px 22px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; margin-bottom:20px; }
        .success-banner .success-icon { color:#16a34a; flex-shrink:0; margin-top:1px; }
        .success-banner h4 { margin:0 0 4px 0; font-size:15px; font-weight:600; color:#15803d; }
        .success-banner p { margin:0; font-size:13.5px; color:#166534; }
        .contact-info-panel { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; }
        .info-item { display:flex; align-items:center; gap:12px; padding:14px 16px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; text-decoration:none; color:inherit; transition:background 0.2s,border-color 0.2s; }
        .info-item:hover { background:#eff6ff; border-color:#bfdbfe; }
        .info-icon { width:40px; height:40px; border-radius:10px; background:#dbeafe; display:flex; align-items:center; justify-content:center; color:#3b82f6; flex-shrink:0; }
        .info-text h4 { margin:0 0 2px 0; font-size:13px; font-weight:600; color:#374151; text-transform:uppercase; letter-spacing:0.3px; }
        .info-text p { margin:0; font-size:14px; color:#111827; font-weight:500; }
        .note-box { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px 16px; font-size:13px; color:#92400e; margin-top:12px; line-height:1.6; }
      `}</style>

      <div className="contact-header">
        <h2><MessageSquare size={24} color="#3b82f6" /> Contact Us</h2>
        <p>Reach out with any questions, suggestions, or complaints — we're here to help.</p>
      </div>

      {submitted && (
        <div className="success-banner">
          <CheckCircle2 size={22} className="success-icon" />
          <div>
            <h4>Message sent successfully!</h4>
            <p>Your email client has opened with the pre-filled message. If nothing opened, please email us directly at <a href="mailto:support@roznamcha.app" style={{color:"#15803d"}}>support@roznamcha.app</a>.</p>
          </div>
        </div>
      )}

      <div className="contact-card">
        <h3 className="card-title">Get in Touch</h3>
        <div className="contact-info-panel">
          <a className="info-item" href="mailto:support@roznamcha.app">
            <div className="info-icon"><Mail size={18} /></div>
            <div className="info-text"><h4>Email</h4><p>support@roznamcha.app</p></div>
            <ExternalLink size={14} style={{marginLeft:"auto",color:"#9ca3af"}} />
          </a>
          <a className="info-item" href="https://wa.me/923001234567" target="_blank" rel="noreferrer">
            <div className="info-icon"><Phone size={18} /></div>
            <div className="info-text"><h4>WhatsApp</h4><p>+92 300 123 4567</p></div>
            <ExternalLink size={14} style={{marginLeft:"auto",color:"#9ca3af"}} />
          </a>
        </div>
        <div className="note-box">⏰ Our support team typically responds within <strong>24 hours</strong> on business days (Monday – Saturday).</div>
      </div>

      <div className="contact-card">
        <h3 className="card-title">Send a Message</h3>
        <div className="query-type-group">
          {QUERY_TYPES.map(type => (
            <button
              key={type.value}
              type="button"
              className={`query-type-btn ${form.queryType === type.value ? "active-query" : ""}`}
              style={{"--qcolor": type.color} as React.CSSProperties}
              onClick={() => setForm(prev => ({...prev, queryType: type.value}))}
            >
              {type.icon}
              <div className="btn-inner">
                <span>{type.label}</span>
                <span className="urdu-sub">{type.urdu}</span>
              </div>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Name <span className="required">*</span></label>
              <input className={`input-field ${errors.name ? "error" : ""}`} name="name" value={form.name} onChange={handleChange} placeholder="Your full name" />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Email <span className="required">*</span></label>
              <input className={`input-field ${errors.email ? "error" : ""}`} name="email" type="email" value={form.email} onChange={handleChange} placeholder="you@example.com" dir="ltr" />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Phone <span style={{fontWeight:400,textTransform:"none",color:"#9ca3af"}}>(optional)</span></label>
              <input className="input-field" name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="e.g. 0300-1234567" dir="ltr" />
            </div>

            <div className="form-group">
              <label className="form-label">Subject <span className="required">*</span></label>
              <input className={`input-field ${errors.subject ? "error" : ""}`} name="subject" value={form.subject} onChange={handleChange} placeholder={`Brief subject for your ${activeType.label.toLowerCase()}`} />
              {errors.subject && <span className="field-error">{errors.subject}</span>}
            </div>

            <div className="form-group full-width">
              <label className="form-label">Message <span className="required">*</span></label>
              <textarea className={`input-field textarea-field ${errors.message ? "error" : ""}`} name="message" value={form.message} onChange={handleChange} placeholder={`Describe your ${activeType.label.toLowerCase()} in detail…`} maxLength={1000} />
              {errors.message && <span className="field-error">{errors.message}</span>}
              <span className="char-count">{form.message.length} / 1000</span>
            </div>
          </div>

          <div className="form-footer">
            <p style={{margin:0,fontSize:"12.5px",color:"#9ca3af"}}>Fields marked <span style={{color:"#ef4444"}}>*</span> are required</p>
            <button type="submit" className="submit-btn">
              <Send size={16} /> Send {activeType.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
