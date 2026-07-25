import { useState, useRef, type ChangeEvent } from "react";
import { useSetting } from "@/hooks/useSetting";
import { Pencil, Camera, Trash2, Building2, MapPin, Phone, Mail, Save } from "lucide-react";
import Logo from "../assets/Logo.png";

export default function Settings() {
    // Company name
    const [companyName, setCompanyName, loading] = useSetting("companyName", "Company Name");
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameInput, setNameInput] = useState(companyName);

    // Profile picture (stored as base64 string in settings)
    const [profilePic, setProfilePic] = useSetting<string | null>("profilePic", null);

    // Extra business info (optional but practical)
    const [businessAddress, setBusinessAddress] = useSetting("businessAddress", "");
    const [businessPhone, setBusinessPhone] = useSetting("businessPhone", "");
    const [businessEmail, setBusinessEmail] = useSetting("businessEmail", "");

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle profile picture upload
    const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            alert("Image size should be less than 2MB");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setProfilePic(base64);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveImage = () => {
        setProfilePic(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // Handle company name save
    const handleSaveName = async () => {
        if (nameInput.trim()) {
            await setCompanyName(nameInput.trim());
        }
        setIsEditingName(false);
    };

    const handleCancelName = () => {
        setNameInput(companyName);
        setIsEditingName(false);
    };

    if (loading) {
        return (
            <div className="settings-container">
                <div className="settings-card">
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-line" />
                    <div className="skeleton skeleton-line short" />
                </div>
            </div>
        );
    }

    return (
        <div className="settings-container">
            <style>{`
                .settings-container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 24px;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                .settings-header {
                    margin-bottom: 32px;
                }
                .settings-header h2 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #1f2937;
                    margin: 0 0 6px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .settings-header p {
                    color: #6b7280;
                    margin: 0;
                    font-size: 15px;
                }
                .settings-card {
                    background: #ffffff;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 28px;
                    margin-bottom: 20px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .card-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: #374151;
                    margin: 0 0 20px 0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 1px solid #f3f4f6;
                    padding-bottom: 12px;
                }
                
                /* Profile Section */
                .profile-section {
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    flex-wrap: wrap;
                }
                .profile-avatar-wrapper {
                    position: relative;
                    width: 120px;
                    height: 120px;
                    flex-shrink: 0;
                }
                .profile-avatar {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 3px solid #e5e7eb;
                    background: #f9fafb;
                }
                .profile-avatar-placeholder {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 42px;
                    font-weight: 700;
                    border: 3px solid #e5e7eb;
                }
                .profile-avatar-overlay {
                    position: absolute;
                    bottom: 4px;
                    right: 4px;
                    background: #3b82f6;
                    color: white;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    border: 3px solid white;
                    transition: background 0.2s;
                }
                .profile-avatar-overlay:hover {
                    background: #2563eb;
                }
                .profile-info {
                    flex: 1;
                    min-width: 200px;
                }
                .profile-info h3 {
                    margin: 0 0 6px 0;
                    font-size: 22px;
                    color: #111827;
                }
                .profile-info p {
                    margin: 0;
                    color: #6b7280;
                    font-size: 14px;
                }
                .profile-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 14px;
                }
                
                /* Buttons */
                .btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s;
                }
                .btn-primary {
                    background: #3b82f6;
                    color: white;
                }
                .btn-primary:hover {
                    background: #2563eb;
                }
                .btn-secondary {
                    background: #f3f4f6;
                    color: #374151;
                    border: 1px solid #d1d5db;
                }
                .btn-secondary:hover {
                    background: #e5e7eb;
                }
                .btn-danger {
                    background: #fef2f2;
                    color: #dc2626;
                    border: 1px solid #fecaca;
                }
                .btn-danger:hover {
                    background: #fee2e2;
                }
                .btn-sm {
                    padding: 6px 12px;
                    font-size: 13px;
                }

                .btn svg {
                    margin-top: 7px;
                }
                
                /* Company Name Editor */
                .company-name-display {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    padding: 8px 12px;
                    border-radius: 8px;
                    transition: background 0.2s;
                    width: fit-content;
                }
                .company-name-display:hover {
                    background: #f3f4f6;
                }
                .company-name-text {
                    font-size: 20px;
                    font-weight: 600;
                    color: #111827;
                }
                .edit-icon-inline {
                    color: #9ca3af;
                    width: 16px;
                    height: 16px;
                    opacity: 0;
                    transition: opacity 0.2s;
                }
                .company-name-display:hover .edit-icon-inline {
                    opacity: 1;
                }
                .company-name-input-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .input-field {
                    padding: 8px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 16px;
                    width: 300px;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .input-field:focus {
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                /* Form Grid */
                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .form-label {
                    font-size: 13px;
                    font-weight: 600;
                    color: #374151;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                .form-hint {
                    font-size: 12px;
                    color: #9ca3af;
                    margin: 0;
                }
                
                /* Skeleton Loading */
                .skeleton {
                    background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.5s infinite;
                    border-radius: 8px;
                }
                .skeleton-title {
                    height: 28px;
                    width: 60%;
                    margin-bottom: 16px;
                }
                .skeleton-line {
                    height: 16px;
                    width: 100%;
                    margin-bottom: 10px;
                }
                .skeleton-line.short {
                    width: 40%;
                }
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                
                /* RTL Support for Urdu text */
                .urdu-text {
                    font-family: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', 'Urdu Typesetting', serif;
                }
            `}</style>

            {/* Page Header */}
            <div className="settings-header">
                <h2>
                    <Building2 size={26} color="#3b82f6" />
                    Settings
                </h2>
                <p>Manage your business profile and application preferences</p>
            </div>

            {/* Profile Picture & Company Name Card */}
            <div className="settings-card">
                <h3 className="card-title">Business Identity</h3>

                <div className="profile-section">
                    {/* Avatar */}
                    <div className="profile-avatar-wrapper">
                        {profilePic ? (
                            <img src={profilePic ?? Logo} alt="Profile" className="profile-avatar" />
                        ) : (
                            <div className="profile-avatar-placeholder">
                                {companyName.charAt(0).toUpperCase()}
                            </div>
                        )}

                        <div
                            className="profile-avatar-overlay"
                            onClick={() => fileInputRef.current?.click()}
                            title="Change picture"
                        >
                            <Camera size={16} />
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: "none" }}
                        />
                    </div>

                    {/* Info */}
                    <div className="profile-info">
                        {isEditingName ? (
                            <div className="company-name-input-group">
                                <input
                                    autoFocus
                                    className="input-field"
                                    value={nameInput}
                                    onChange={(e) => setNameInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveName();
                                        if (e.key === "Escape") handleCancelName();
                                    }}
                                    placeholder="Company Name"
                                />
                                <button className="btn btn-primary btn-sm" onClick={handleSaveName}>
                                    <Save size={14} /> Save
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={handleCancelName}>
                                    <XIcon /> Cancel
                                </button>
                            </div>
                        ) : (
                            <div
                                className="company-name-display"
                                onClick={() => {
                                    setNameInput(companyName);
                                    setIsEditingName(true);
                                }}
                            >
                                <span className="company-name-text">{companyName}</span>
                                <Pencil className="edit-icon-inline" />
                            </div>
                        )}

                        <p className="urdu-text">روزنامچہ رجسٹر — Daily Account Register</p>

                        <div className="profile-actions">
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Camera size={14} /> {profilePic ? "Change Picture" : "Upload Picture"}
                            </button>

                            {
                                !profilePic &&
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setProfilePic(Logo)}
                                >
                                    <Camera size={14} /> Use Default Picture
                                </button>
                            }

                            {profilePic && (
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={handleRemoveImage}
                                >
                                    <Trash2 size={14} /> Remove
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Business Details Card */}
            <div className="settings-card">
                <h3 className="card-title">Contact Details</h3>
                <div className="form-grid">
                    <div className="form-group">
                        <label className="form-label">
                            <MapPin size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                            Business Address
                        </label>
                        <input
                            className="input-field"
                            value={businessAddress}
                            onChange={(e) => setBusinessAddress(e.target.value)}
                            placeholder="e.g. Main Bazaar, Lahore"
                        />
                        <p className="form-hint">This will appear on printed reports</p>
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            <Phone size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                            Phone Number
                        </label>
                        <input
                            className="input-field"
                            value={businessPhone}
                            onChange={(e) => setBusinessPhone(e.target.value)}
                            placeholder="e.g. 0300-1234567"
                            dir="ltr"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            <Mail size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                            Email Address
                        </label>
                        <input
                            className="input-field"
                            value={businessEmail}
                            onChange={(e) => setBusinessEmail(e.target.value)}
                            placeholder="e.g. info@company.com"
                            dir="ltr"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Simple X icon component since lucide-react X might conflict
function XIcon() {
    return (
        <svg style={{ marginTop: "7px" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}