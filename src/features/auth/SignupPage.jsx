import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

export default function SignupPage() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'agent',
    licenseNumber: '',
    company: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const { signup, googleSignIn, authError, setAuthError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    if (!formData.fullName.trim()) {
      toast.error('Full name is required');
      return false;
    }
    if (!formData.email.trim()) {
      toast.error('Email is required');
      return false;
    }
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return false;
    }
    return true;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setAuthError(null);
    try {
      await signup(formData.email, formData.password, {
        fullName: formData.fullName.trim(),
        role: formData.role,
        licenseNumber: formData.licenseNumber.trim(),
        company: formData.company.trim(),
        phone: formData.phone.trim(),
      });
      toast.success('Account created — check your email to verify');
      navigate(returnUrl.startsWith('/') ? returnUrl : '/dashboard');
    } catch (error) {
      toast.error(error.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    setAuthError(null);
    try {
      await googleSignIn();
      toast.success('Signed in with Google');
      navigate(returnUrl.startsWith('/') ? returnUrl : '/dashboard');
    } catch (error) {
      toast.error(error.message || 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-2xl font-bold mb-2">Create account</h1>
        <p className="text-sm text-slate-600 mb-6">No payment required for trial access</p>

        {authError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {authError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            name="fullName"
            placeholder="Full name"
            value={formData.fullName}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            required
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            autoComplete="email"
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            autoComplete="new-password"
            required
            minLength={6}
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm password"
            value={formData.confirmPassword}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            autoComplete="new-password"
            required
            minLength={6}
          />
          <select
            name="role"
            value={formData.role}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="agent">Real Estate Agent</option>
            <option value="broker">Broker</option>
            <option value="investor">Investor</option>
            <option value="team">Team Member</option>
          </select>
          <input
            type="text"
            name="licenseNumber"
            placeholder="License number (optional)"
            value={formData.licenseNumber}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
          <input
            type="text"
            name="company"
            placeholder="Company (optional)"
            value={formData.company}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
          <input
            type="tel"
            name="phone"
            placeholder="Phone (optional)"
            value={formData.phone}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Sign up'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full mt-3 border border-slate-300 rounded-lg py-2 font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Continue with Google
        </button>

        <p className="mt-4 text-sm text-slate-600 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
