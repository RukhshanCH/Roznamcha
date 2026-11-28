import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
import { useSetting } from "@/hooks/useSetting";
import { Pencil, Camera, Trash2, Building2, MapPin, Phone, Mail, Save, X } from "lucide-react";
import Logo from "../assets/Logo.webp";
import { useAtomValue } from 'jotai';
import { userAtom } from '@/store/atoms';
import { changeUserEmail, changeUserPassword, updateUserProfile } from '@/hooks/useAuth';

export default function Settings() {
    const user = useAtomValue(userAtom);
    const [accountName, setAccountName] = useState(
        typeof user?.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : '',
    );
    const [profileError, setProfileError] = useState('');
    const [profileMessage, setProfileMessage] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);

    const saveAccountProfile = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setProfileError('');
        setProfileMessage('');
        setProfileSaving(true);
        try {
            await updateUserProfile({ displayName: accountName });
            setProfileMessage('Display name updated.');
        } catch (error) {
            setProfileError(error instanceof Error ? error.message : 'Could not update the account profile.');
        } finally {
            setProfileSaving(false);
        }
    };

    // Change email (Supabase sends a confirmation link to the new address;
    // with secure email change enabled it also asks the current address).
    const [newEmail, setNewEmail] = useState('');
    const [emailError, setEmailError] = useState('');
    const [emailMessage, setEmailMessage] = useState('');
    const [emailSaving, setEmailSaving] = useState(false);

    const saveEmail = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setEmailError('');
        setEmailMessage('');
        if (newEmail.trim().toLowerCase() === (user?.email ?? '').toLowerCase()) {
            setEmailError('That is already your current email address.');
            return;
        }
        setEmailSaving(true);
        try {
            await changeUserEmail(newEmail);
            setNewEmail('');
            setEmailMessage('Confirmation link sent. Open the link in the new inbox (and your current inbox, if asked) to finish changing your email.');
        } catch (error) {
            setEmailError(error instanceof Error ? error.message : 'Could not change the email address.');
        } finally {
            setEmailSaving(false);
        }
    };

    // Change password (current password is verified first, new + confirm must match)
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordMessage, setPasswordMessage] = useState('');
    const [passwordSaving, setPasswordSaving] = useState(false);

    const savePassword = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPasswordError('');
        setPasswordMessage('');
        if (!currentPassword) {
            setPasswordError('Enter your current password.');
            return;
        }
        if (newPassword.length < 8) {
            setPasswordError('New password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('New password and confirm password do not match.');
            return;
        }
        if (newPassword === currentPassword) {
            setPasswordError('New password must be different from the current password.');
            return;
        }
        setPasswordSaving(true);
        try {
            await changeUserPassword(currentPassword, newPassword);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordMessage('Password changed.');
        } catch (error) {
            setPasswordError(error instanceof Error ? error.message : 'Could not change the password.');
        } finally {
            setPasswordSaving(false);
        }
    };

    // Company name
    const [companyName, setCompanyName, loading] = useSetting("companyName", "Company Name");
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameInput, setNameInput] = useState(companyName);

    // Profile picture (stored as base64 string in settings)
    const [profilePic, setProfilePic] = useSetting<string | null>("profilePic", null);

    // Extra business info — edited through a draft form (ContactDetailsForm)
    // so a value is written once, on Save, not on every keystroke.
    const [businessAddress, setBusinessAddress, businessAddressLoading] = useSetting("businessAddress", "");
    const [businessPhone, setBusinessPhone, businessPhoneLoading] = useSetting("businessPhone", "");
    const [businessEmail, setBusinessEmail, businessEmailLoading] = useSetting("businessEmail", "");
    const contactLoading = businessAddressLoading || businessPhoneLoading || businessEmailLoading;

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
        <div dir="ltr" className="settings-container">
            <style>{`
                .settings-container {
                    max-width: 800px;
                    margin: 0 auto;
                    font-family: var(--font-ui);
                }
                .settings-header {
                    margin-bottom: 32px;
                }
                .settings-header h2 {
                    font-size: 28px;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin: 0 0 6px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .settings-header p {
                    color: var(--text-secondary);
                    margin: 0;
                    font-size: 15px;
                }
                .settings-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 28px;
                    margin-bottom: 20px;
                    box-shadow: var(--shadow-card);
                }
                .card-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin: 0 0 20px 0;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 1px solid var(--border-color);
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
                    border: 3px solid var(--border-color);
                    background: var(--table-header-bg);
                }
                .profile-avatar-placeholder {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: linear-gradient(135deg, var(--accent-blue), var(--accent-blue-hover));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 42px;
                    font-weight: 700;
                    border: 3px solid var(--border-color);
                }
                .profile-avatar-overlay {
                    position: absolute;
                    bottom: 4px;
                    right: 4px;
                    background: var(--accent-blue);
                    color: white;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    border: 3px solid var(--bg-card);
                    transition: background 0.2s;
                }
                .profile-avatar-overlay:hover {
                    background: var(--accent-blue-hover);
                }
                .profile-info {
                    flex: 1;
                    min-width: 200px;
                }
                .profile-info h3 {
                    margin: 0 0 6px 0;
                    font-size: 22px;
                    color: var(--text-primary);
                }
                .profile-info p {
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: 14px;
                }
                .profile-actions {
                    display: flex;
                    flex-wrap: wrap;
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
                    font-family: var(--font-ui);
                    cursor: pointer;
                    border: none;
                    transition: all 0.2s;
                }
                .btn-primary {
                    background: var(--accent-blue);
                    color: white;
                }
                .btn-primary:hover {
                    background: var(--accent-blue-hover);
                }
                .btn-secondary {
                    background: #f3f4f6;
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
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

                .btn {
                    line-height: 1;
                }
                .btn svg {
                    display: block;
                    flex-shrink: 0;
                }
                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
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
                    color: var(--text-primary);
                }
                .edit-icon-inline {
                    color: var(--text-secondary);
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
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 8px;
                }
                .input-field {
                    min-width: 0;
                    padding: 8px 12px;
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    font-size: 16px;
                    font-family: var(--font-ui);
                    color: var(--text-primary);
                    background: var(--bg-card);
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .input-field:focus {
                    border-color: var(--accent-blue);
                    box-shadow: 0 0 0 3px var(--accent-blue-light);
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
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                .form-label svg {
                    display: block;
                    flex-shrink: 0;
                }
                .form-hint {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin: 0;
                }
                
                /* Skeleton Loading */
                .skeleton {
                    background: linear-gradient(90deg, #f3f4f6 25%, var(--border-color) 50%, #f3f4f6 75%);
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
                @media (max-width: 640px) {
                    .settings-card {
                        padding: 20px;
                    }
                    .settings-header h2 {
                        font-size: 24px;
                    }
                    .form-grid {
                        grid-template-columns: minmax(0, 1fr);
                    }
                    .company-name-input-group .input-field {
                        flex: 1 1 160px;
                    }
                }
            `}</style>

            {/* Page Header */}
            <div className="settings-header">
                <h2>
                    <Building2 size={26} color="var(--accent-blue)" />
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
                        <img src={profilePic ?? Logo} alt="Profile" className="profile-avatar" />

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
                                    <X size={14} /> Cancel
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
                                <Camera size={14} /> {profilePic !== null ? "Change Picture" : "Upload Picture"}
                            </button>

                            {profilePic !== null && (
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={handleRemoveImage}
                                >
                                    <Trash2 size={14} /> Remove
                                </button>
                            )}
                        </div>
                        {profilePic === null && (
                            <p className="form-hint" style={{ marginTop: "8px" }}>Using the default Roznamcha logo</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="settings-card">
                <h3 className="card-title">Account Profile</h3>
                <p style={{ marginBottom: "16px" }}>{user?.email}</p>
                <form onSubmit={saveAccountProfile}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label" htmlFor="account-display-name">Display name</label>
                            <input
                                id="account-display-name"
                                className="input-field"
                                autoComplete="name"
                                value={accountName}
                                onChange={(event) => setAccountName(event.target.value)}
                            />
                        </div>
                    </div>
                    {profileError && <p role="alert" className="auth-error">{profileError}</p>}
                    {profileMessage && <p role="status" className="auth-success">{profileMessage}</p>}
                    <button className="btn btn-primary" type="submit" disabled={profileSaving} style={{ marginTop: "14px" }}>
                        <Save size={14} /> {profileSaving ? 'Saving…' : 'Save display name'}
                    </button>
                </form>
            </div>

            <div className="settings-card">
                <h3 className="card-title">Change Email</h3>
                <form onSubmit={saveEmail}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label" htmlFor="account-current-email">Current email</label>
                            <input
                                id="account-current-email"
                                className="input-field"
                                value={user?.email ?? ''}
                                readOnly
                                dir="ltr"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="account-new-email">New email</label>
                            <input
                                id="account-new-email"
                                className="input-field"
                                type="email"
                                autoComplete="email"
                                value={newEmail}
                                onChange={(event) => setNewEmail(event.target.value)}
                                placeholder="e.g. new@company.com"
                                dir="ltr"
                                required
                            />
                        </div>
                    </div>
                    <p className="form-hint" style={{ marginTop: "10px" }}>
                        For security, Supabase emails a confirmation link before the change takes effect. Your email stays the same until you open that link.
                    </p>
                    {emailError && <p role="alert" className="auth-error">{emailError}</p>}
                    {emailMessage && <p role="status" className="auth-success">{emailMessage}</p>}
                    <button className="btn btn-primary" type="submit" disabled={emailSaving} style={{ marginTop: "14px" }}>
                        <Mail size={14} /> {emailSaving ? 'Sending…' : 'Send confirmation link'}
                    </button>
                </form>
            </div>

            <div className="settings-card">
                <h3 className="card-title">Change Password</h3>
                <form onSubmit={savePassword}>
                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label" htmlFor="account-current-password">Current password</label>
                            <input
                                id="account-current-password"
                                className="input-field"
                                type="password"
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="account-new-password">New password</label>
                            <input
                                id="account-new-password"
                                className="input-field"
                                type="password"
                                autoComplete="new-password"
                                minLength={8}
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="account-confirm-password">Confirm new password</label>
                            <input
                                id="account-confirm-password"
                                className="input-field"
                                type="password"
                                autoComplete="new-password"
                                minLength={8}
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                required
                            />
                        </div>
                    </div>
                    {passwordError && <p role="alert" className="auth-error">{passwordError}</p>}
                    {passwordMessage && <p role="status" className="auth-success">{passwordMessage}</p>}
                    <button className="btn btn-primary" type="submit" disabled={passwordSaving} style={{ marginTop: "14px" }}>
                        <Save size={14} /> {passwordSaving ? 'Saving…' : 'Change password'}
                    </button>
                </form>
            </div>

            {/* Contact Details Card — draft form, saved explicitly.
                These details print on the Roznamcha report and the Invoice. */}
            <div className="settings-card">
                <h3 className="card-title">Contact Details</h3>
                {contactLoading ? (
                    <div>
                        <div className="skeleton skeleton-line" />
                        <div className="skeleton skeleton-line short" />
                    </div>
                ) : (
                    <ContactDetailsForm
                        key={`${businessAddress}|${businessPhone}|${businessEmail}`}
                        initialAddress={businessAddress}
                        initialPhone={businessPhone}
                        initialEmail={businessEmail}
                        onSave={async (values) => {
                            await setBusinessAddress(values.address);
                            await setBusinessPhone(values.phone);
                            await setBusinessEmail(values.email);
                        }}
                    />
                )}
            </div>
        </div>
    );
}

// Draft form for the contact details: typing only changes local state, so a
// cloud reload can never revert the field mid-typing (the old inputs wrote
// straight to the synced setting on every keystroke and appeared not to
// save). One Save writes all three values, once.
function ContactDetailsForm({
    initialAddress,
    initialPhone,
    initialEmail,
    onSave,
}: {
    initialAddress: string;
    initialPhone: string;
    initialEmail: string;
    onSave: (values: { address: string; phone: string; email: string }) => Promise<void>;
}) {
    const [address, setAddress] = useState(initialAddress);
    const [phone, setPhone] = useState(initialPhone);
    const [email, setEmail] = useState(initialEmail);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setMessage('');
        setSaving(true);
        try {
            await onSave({ address: address.trim(), phone: phone.trim(), email: email.trim() });
            setMessage('Contact details saved. They now appear on printed reports and invoices.');
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Could not save the contact details.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <div className="form-grid">
                <div className="form-group">
                    <label className="form-label" htmlFor="contact-address">
                        <MapPin size={14} />
                        Business Address
                    </label>
                    <input
                        id="contact-address"
                        className="input-field"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g. Main Bazaar, Lahore"
                    />
                    <p className="form-hint">This appears on printed reports and invoices</p>
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="contact-phone">
                        <Phone size={14} />
                        Phone Number
                    </label>
                    <input
                        id="contact-phone"
                        className="input-field"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 0300-1234567"
                        dir="ltr"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="contact-email">
                        <Mail size={14} />
                        Email Address
                    </label>
                    <input
                        id="contact-email"
                        className="input-field"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. info@company.com"
                        dir="ltr"
                    />
                </div>
            </div>
            {error && <p role="alert" className="auth-error">{error}</p>}
            {message && <p role="status" className="auth-success">{message}</p>}
            <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: "14px" }}>
                <Save size={14} /> {saving ? 'Saving…' : 'Save contact details'}
            </button>
        </form>
    );
}
