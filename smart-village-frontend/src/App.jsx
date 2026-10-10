import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Map, Layers, LayoutDashboard, MapPin, Search, Bell, ArrowUpRight, RefreshCw, Crosshair, ChevronRight, X, Building2, CircleCheck, TriangleAlert, Activity, LogIn, LogOut, LocateFixed, Plus, Check, Menu } from 'lucide-react';
import VillageMap from './VillageMap.jsx';
import { api, allRecords } from './api.js';
import { assetTypes, statusColors, categories, label, isOpen, insideBoundary } from './constants.js';

export default function DigitalTwin({ session = null, onSession, onReport, embedded = false }) {
  const [dataset, setDataset] = useState(null), [auth, setAuth] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [view, setView] = useState('all'), [assetType, setAssetType] = useState('all'), [status, setStatus] = useState('all'), [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null), [showBoundary, setShowBoundary] = useState(true), [home, setHome] = useState(0), [picking, setPicking] = useState(false), [picked, setPicked] = useState(null);
  const [authOpen, setAuthOpen] = useState(false), [register, setRegister] = useState(false), [authError, setAuthError] = useState(''), [authBusy, setAuthBusy] = useState(false), [submitBusy, setSubmitBusy] = useState(false), [submitError, setSubmitError] = useState(''), [success, setSuccess] = useState(''), [sidebarOpen, setSidebarOpen] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (auth) {
        const [village, assets, complaints] = await Promise.all([api(`/villages/${auth.user.villageId}`, { token: auth.accessToken }), allRecords('/assets', auth.accessToken), allRecords('/complaints', auth.accessToken)]);
        setDataset({ village: village.data, assets: assets.items, complaints: complaints.items, meta: { mode: 'authenticated', fetchedAt: new Date().toISOString(), truncated: assets.truncated || complaints.truncated } });
      } else {
        const result = await api('/demo/snapshot');
        setDataset({ ...result.data, meta: result.meta });
      }
    } catch (e) { setError(e.status === 401 ? auth ? 'Your session expired. Sign in again to load your village.' : 'Sign in to view your village. The public demo is available only with the local development launcher.' : e.status === 404 ? 'Sign in to view your village. The public demo is available only with the local development launcher.' : e.message); }
    finally { setLoading(false); }
  }, [auth]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (embedded) setAuth(session); }, [session, embedded]);
  useEffect(() => { if (embedded) return; let active = true; api('/auth/refresh', { method: 'POST' }).then(r => { if (active) setAuth(r.data); }).catch(() => {}); return () => { active = false; }; }, [embedded]);
  const assets = dataset?.assets || [], complaints = dataset?.complaints || [];
  const matchingAssets = useMemo(() => assets.filter(a => (assetType === 'all' || a.assetType === assetType) && `${a.name} ${a.assetCode} ${a.assetType}`.toLowerCase().includes(search.toLowerCase())), [assets, assetType, search]);
  const matchingComplaints = useMemo(() => complaints.filter(c => (status === 'all' || c.status === status) && (category === 'all' || c.category === category) && `${c.title} ${c.trackingNumber} ${c.category}`.toLowerCase().includes(search.toLowerCase())), [complaints, status, category, search]);
  const visibleAssets = view === 'complaints' ? [] : matchingAssets;
  const visibleComplaints = view === 'assets' ? [] : matchingComplaints;
  const openComplaints = complaints.filter(isOpen);
  const poorAssets = assets.filter(a => ['poor', 'critical'].includes(a.condition));
  const completed = complaints.filter(c => ['resolved', 'closed'].includes(c.status));
  const within = picked && insideBoundary(picked, dataset?.village?.boundary);
  const select = entry => { setSelected(entry); setPicking(false); };
  const startPicking = () => { setPicking(true); setSelected(null); setSuccess(''); setSubmitError(''); setView('all'); setHome(v => v + 1); };
  const clearFilters = () => { setSearch(''); setView('all'); setAssetType('all'); setStatus('all'); setCategory('all'); };
  async function authenticate(event) {
    event.preventDefault(); setAuthBusy(true); setAuthError('');
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: form });
      setAuth(result.data); onSession?.(result.data); setAuthOpen(false); setSelected(null);
    } catch (e) { setAuthError(e.message); }
    finally { setAuthBusy(false); }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST', token: auth.accessToken }); setAuth(null); onSession?.(null); setSelected(null); }
    catch (e) { setError(e.message); }
  }
  async function submitComplaint(event) {
    event.preventDefault(); setSubmitError('');
    if (!auth) { setAuthOpen(true); setRegister(true); return; }
    if (auth.user.role !== 'citizen') { setSubmitError('Complaint submission is available to citizen accounts.'); return; }
    if (!picked || !within) { setSubmitError('Choose a point within the village boundary.'); return; }
    setSubmitBusy(true);
    const formElement = event.currentTarget;
    const body = { ...Object.fromEntries(new FormData(formElement)), location: { type: 'Point', coordinates: picked } };
    try {
      const result = await api('/complaints', { method: 'POST', token: auth.accessToken, body });
      setSuccess(`Complaint submitted · ${result.data.trackingNumber}`); setPicking(false); setPicked(null); formElement.reset();
      await refresh(); setSelected({ kind: 'complaint', record: result.data });
    } catch (e) { setSubmitError(e.message); }
    finally { setSubmitBusy(false); }
  }
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
      <a className="brand" href="/" aria-label="Gram home"><span className="brand-mark"><Layers size={25} /></span><span>gram<span className="brand-dot">.</span><small>CONNECTED VILLAGES</small></span></a>
      <div className="workspace-label">VILLAGE WORKSPACE</div>
      <button className="nav-item active" onClick={() => { setHome(v => v + 1); setSidebarOpen(false); }}><LayoutDashboard size={19} />Digital Twin<span className="nav-dot" /></button>
      <button className="nav-item" onClick={() => { clearFilters(); setView('assets'); setSidebarOpen(false); }}><Building2 size={19} />Asset register<span className="nav-count">{assets.length}</span></button>
      <button className="nav-item" onClick={() => { clearFilters(); setView('complaints'); setSidebarOpen(false); document.getElementById('complaint-register')?.scrollIntoView({ behavior: 'smooth' }); }}><MapPin size={19} />Complaints<span className="nav-count">{complaints.length}</span></button>
      <div className="sidebar-separator" /><div className="workspace-label">MAP LAYERS</div>
      <label className="layer-toggle"><input type="checkbox" checked={showBoundary} onChange={e => setShowBoundary(e.target.checked)} /><span className="boundary-swatch" />Village boundary</label>
      <label className="layer-toggle"><input type="checkbox" checked={view !== 'complaints'} onChange={e => setView(e.target.checked ? 'all' : 'complaints')} /><span className="asset-swatch" />Public assets</label>
      <label className="layer-toggle"><input type="checkbox" checked={view !== 'assets'} onChange={e => setView(e.target.checked ? 'all' : 'assets')} /><span className="complaint-swatch" />Complaints</label>
      <div className="sidebar-note"><div className="note-icon"><Map size={20} /></div><strong>A village, in one view.</strong><p>Explore infrastructure and public service reports on a shared map.</p><span>GIS + PUBLIC SERVICES</span></div>
      <div className="sidebar-bottom"><span className={`connection-dot ${error ? 'offline' : ''}`} />{error ? 'Connection needs attention' : loading ? 'Synchronizing…' : 'Connected to local API'}<small>Phase 4 · GIS & Digital Twin</small></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Toggle navigation" onClick={() => setSidebarOpen(v => !v)}><Menu size={20} /></button><div className="breadcrumb">Workspace <ChevronRight size={14} /><strong>Digital Twin</strong></div><div className="topbar-right"><span className="environment-tag">LOCAL WORKSPACE</span>{auth ? <><span className="user-badge">{auth.user.name} <small>{label(auth.user.role)}</small></span><button className="icon-button" aria-label="Sign out" onClick={logout}><LogOut size={18} /></button></> : <button className="login-button" onClick={() => { setRegister(false); setAuthOpen(true); }}><LogIn size={16} />Sign in</button>}</div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span />VILLAGE INTELLIGENCE</div><h1>Digital Twin<span className="heading-period">.</span></h1><p>Your infrastructure, service reports, and village geography. Together.</p></div><button className="primary-button" onClick={onReport || startPicking}><Plus size={17} />{embedded && session && session.user.role !== 'citizen' ? 'Manage complaints' : 'Report an issue'}</button></div>
        <div className={`data-banner ${dataset?.meta.mode === 'demo' || dataset?.village.isDemo ? '' : 'real-data'}`}><TriangleAlert size={16} /><span>{dataset?.meta.mode === 'demo' ? <><strong>Demonstration workspace.</strong> Boundary, assets, and sample complaints are synthetic, placed on a real OpenStreetMap basemap.</> : dataset?.village.isDemo ? <><strong>Synthetic village boundary and assets.</strong> Your submitted reports are saved records. Complaint visibility follows your {auth?.user.role} permissions.</> : <><strong>Authenticated village workspace.</strong> Showing records permitted for your account.</>}</span><span className="banner-tag">{dataset?.meta.mode === 'demo' || dataset?.village.isDemo ? 'DEMO DATA' : 'YOUR VILLAGE'}</span></div>
        {error && <div className="error-banner" role="alert">{error}<button onClick={refresh}>Retry</button><button onClick={() => setAuthOpen(true)}>Sign in</button></div>}
        {success && <div className="success-banner" role="status"><CircleCheck size={18} />{success}<button aria-label="Dismiss success message" onClick={() => setSuccess('')}><X size={16} /></button></div>}
        {dataset?.meta.truncated && <div className="error-banner">Results are capped at 5,000 records. Totals refer to loaded records.</div>}
        <div className="metrics-grid">
          <Metric title="PUBLIC ASSETS" value={assets.length} detail="Infrastructure in this workspace" icon={<Building2 size={21} />} tone="green" />
          <Metric title="OPEN COMPLAINTS" value={openComplaints.length} detail="Awaiting action or in progress" icon={<MapPin size={21} />} tone="orange" />
          <Metric title="RESOLVED / CLOSED" value={completed.length} detail="Recorded as resolved or closed" icon={<CircleCheck size={21} />} tone="blue" />
          <Metric title="ASSETS TO REVIEW" value={poorAssets.length} detail="Recorded poor or critical condition" icon={<Activity size={21} />} tone="purple" />
        </div>
        <div className="workspace-grid">
          <section className={`map-card ${picking ? 'is-picking' : ''}`}>
            <div className="section-heading"><div><h2>Village overview<span className="count-pill">{visibleAssets.length + visibleComplaints.length} features</span></h2><p>{dataset?.village.name || 'Loading village…'}</p></div><button className="icon-button" aria-label="Refresh village data" onClick={refresh} disabled={loading}><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></div>
            <div className="map-filters"><div className="search-input"><Search size={16} /><input aria-label="Search map features" placeholder="Search assets or complaints…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}</div><select aria-label="Feature layer" value={view} onChange={e => setView(e.target.value)}><option value="all">All layers</option><option value="assets">Assets only</option><option value="complaints">Complaints only</option></select><select aria-label="Asset type" value={assetType} onChange={e => setAssetType(e.target.value)}><option value="all">All asset types</option>{Object.entries(assetTypes).map(([value, type]) => <option key={value} value={value}>{type.label}</option>)}</select><select aria-label="Complaint status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{Object.keys(statusColors).map(value => <option key={value} value={value}>{label(value)}</option>)}</select></div>
            <div className="map-canvas"><VillageMap village={dataset?.village} assets={visibleAssets} complaints={visibleComplaints} selected={selected} onSelect={select} picking={picking} picked={picked} onPick={setPicked} home={home} showBoundary={showBoundary} /><div className="map-toolbar"><button onClick={() => setHome(v => v + 1)} aria-label="Fit map to village boundary" title="Fit village boundary"><LocateFixed size={18} /></button><button className={picking ? 'selected' : ''} onClick={startPicking} aria-label="Select complaint location" title="Select complaint location"><Crosshair size={18} /></button></div>{picking && <div className="picker-notice"><Crosshair size={16} />Click the map to select a complaint location</div>}{!loading && visibleAssets.length + visibleComplaints.length === 0 && <div className="empty-map">No features match your filters. <button onClick={clearFilters}>Reset filters</button></div>}</div>
            <div className="map-footer"><div><span className="legend-boundary" />Village boundary<span className="legend-asset" />Public asset<span className="legend-complaint" />Complaint</div><span>{loading ? 'Updating…' : dataset ? `Updated ${new Date(dataset.meta.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not connected'}</span></div>
          </section>
          <aside className="detail-column">
            {picking ? <section className="info-card report-card"><div className="info-card-heading"><h2>Report an issue</h2><button className="icon-button" aria-label="Cancel report" onClick={() => { setPicking(false); setPicked(null); }}><X size={17} /></button></div><p className="helper-text">Pin the location, then tell us what needs attention.</p><div className={`coordinate-box ${picked && !within ? 'invalid' : ''}`}><Crosshair size={19} /><div><strong>{picked ? `${picked[1].toFixed(6)}, ${picked[0].toFixed(6)}` : 'Select a point on the map'}</strong><small>{picked ? within ? 'Within village boundary · drag pin to adjust' : 'Outside village boundary — select another point' : 'Location is required'}</small></div></div><form onSubmit={submitComplaint}><label>Category<select name="category" required>{categories.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label><label>Issue title<input name="title" required minLength={5} maxLength={160} placeholder="e.g. Street light not working" /></label><label>Description<textarea name="description" required minLength={10} maxLength={5000} placeholder="Describe the problem and nearby landmarks" rows={4} /></label>{submitError && <p className="form-error" role="alert">{submitError}</p>}{!auth && <p className="helper-text">Sign in or create a citizen account to submit. The selected location stays here.</p>}{auth && auth.user.role !== 'citizen' && <p className="helper-text">You are signed in as {auth.user.role}. Use a citizen account to report an issue.</p>}<button className="primary-button full-width" disabled={submitBusy || !picked || !within || (auth && auth.user.role !== 'citizen')}>{submitBusy ? 'Submitting…' : auth ? 'Submit complaint' : 'Continue to sign in'}<ArrowUpRight size={16} /></button></form></section> : selected ? <SelectionCard selected={selected} onClose={() => setSelected(null)} /> : <section className="info-card"><div className="info-card-heading"><h2>Infrastructure mix</h2><Layers size={17} /></div><p className="helper-text">Explore the assets that keep a village moving.</p><div className="mix-list">{Object.entries(assetTypes).filter(([type]) => assets.some(a => a.assetType === type)).map(([type, definition]) => <button key={type} onClick={() => { setAssetType(type); setView('assets'); setSearch(''); }}><span className="mix-icon" style={{ color: definition.color, background: `${definition.color}14` }}>{definition.symbol}</span><span>{definition.label}</span><strong>{assets.filter(a => a.assetType === type).length}</strong><ChevronRight size={13} /></button>)}</div></section>}
            {!picking && <section className="attention-card"><div className="info-card-heading"><h2>Needs a closer look</h2><TriangleAlert size={17} /></div><p className="helper-text">Based on recorded asset condition.</p>{poorAssets.length ? poorAssets.slice(0, 3).map(a => <button key={a._id} onClick={() => { setView('all'); setAssetType('all'); setSearch(''); select({ kind: 'asset', record: a }); }}><span className="attention-dot" /><span>{a.name}<small>{label(a.condition)} condition</small></span><ArrowUpRight size={15} /></button>) : <p className="helper-text">No poor or critical assets recorded.</p>}<div className="attention-footnote">Condition records, not AI predictions.</div></section>}
          </aside>
        </div>
        <section className="complaints-card" id="complaint-register"><div className="section-heading"><div><h2>Complaint register<span className="count-pill">{matchingComplaints.length}</span></h2><p>{auth ? `Reports visible to your ${auth.user.role} account` : 'Sample public service reports · synthetic records'}</p></div><select aria-label="Complaint category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></div><div className="table-wrap"><table><thead><tr><th>COMPLAINT</th><th>CATEGORY</th><th>STATUS</th><th>PRIORITY</th><th>LOCATION</th></tr></thead><tbody>{matchingComplaints.slice(0, 100).map(c => <tr key={c._id}><td><button className="complaint-title" onClick={() => { setView('all'); select({ kind: 'complaint', record: c }); document.querySelector('.map-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{c.title}<small>{c.trackingNumber}{c.isDemo ? ' · DEMO' : ''}</small></button></td><td>{label(c.category)}</td><td><StatusBadge status={c.status} /></td><td><span className={`priority ${c.priority}`}>{label(c.priority)}</span></td><td><button className="location-link" aria-label={`Locate ${c.title}`} onClick={() => { setView('all'); select({ kind: 'complaint', record: c }); document.querySelector('.map-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><MapPin size={14} />View on map</button></td></tr>)}</tbody></table>{!matchingComplaints.length && <div className="empty-table">{loading ? 'Loading complaint records…' : 'No complaints match these filters.'}</div>}{matchingComplaints.length > 100 && <p className="helper-text">Showing the first 100 matching complaints. Narrow your search.</p>}</div></section>
        <footer className="page-footer"><span>gram. <span>Village Digital Twin</span></span><span>Leaflet + OpenStreetMap · {dataset?.meta.mode === 'demo' ? 'Synthetic demonstration' : 'Role-scoped workspace'}</span></footer>
      </main>
    </div>
    {authOpen && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setAuthOpen(false); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close icon-button" onClick={() => setAuthOpen(false)} aria-label="Close sign in"><X size={20} /></button><span className="auth-mark"><Layers size={25} /></span><h2 id="auth-title">{register ? 'Join your village' : 'Welcome back'}</h2><p>{register ? 'Create a citizen account to report and track issues.' : 'Sign in to view the records your account can access.'}</p><form onSubmit={authenticate}>{register && <label>Full name<input name="name" required minLength={2} maxLength={100} autoComplete="name" /></label>}<label>Email<input name="email" type="email" required autoComplete="email" /></label><label>Password<input name="password" type="password" required minLength={12} maxLength={72} autoComplete={register ? 'new-password' : 'current-password'} /></label>{register && <small className="helper-text">Use 12–72 characters. Registration creates a citizen account.</small>}{authError && <p className="form-error" role="alert">{authError}</p>}<button className="primary-button full-width" disabled={authBusy}>{authBusy ? 'Please wait…' : register ? 'Create citizen account' : 'Sign in'}<ArrowUpRight size={17} /></button></form><button className="auth-switch" onClick={() => { setRegister(v => !v); setAuthError(''); }}>{register ? 'Already have an account? Sign in' : 'New here? Create a citizen account'}</button></section></div>}
  </div>;
}
function Metric({ title, value, detail, icon, tone }) { return <div className="metric-card"><div><span className="metric-label">{title}</span><strong>{value}</strong><p>{detail}</p></div><span className={`metric-icon ${tone}`}>{icon}</span></div>; }
function StatusBadge({ status }) { return <span className="status-badge" style={{ '--status-color': statusColors[status] || '#748780' }}><i />{label(status)}</span>; }
function SelectionCard({ selected, onClose }) {
  const record = selected.record, asset = selected.kind === 'asset';
  const coordinates = asset ? record.geometry.type === 'Point' ? record.geometry.coordinates : null : record.location.coordinates;
  return <section className="info-card selection-card"><div className="info-card-heading"><span className="eyebrow">{asset ? 'ASSET DETAILS' : 'COMPLAINT DETAILS'}</span><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={17} /></button></div><span className={`selection-icon ${asset ? 'asset' : 'complaint'}`}>{asset ? <Building2 size={25} /> : <MapPin size={25} />}</span><h2>{asset ? record.name : record.title}</h2><p className="record-code">{asset ? record.assetCode : record.trackingNumber}</p>{record.isDemo && <span className="demo-chip">SYNTHETIC DEMO RECORD</span>}<dl>{asset ? <><dt>Asset type</dt><dd>{label(record.assetType)}</dd><dt>Condition</dt><dd>{label(record.condition)}</dd><dt>Geometry</dt><dd>{record.geometry.type}</dd><dt>Data source</dt><dd>{record.dataSource || 'Not recorded'}</dd></> : <><dt>Category</dt><dd>{label(record.category)}</dd><dt>Status</dt><dd><StatusBadge status={record.status} /></dd><dt>Priority</dt><dd>{label(record.priority)}</dd><dt>Description</dt><dd>{record.description}</dd></>}{coordinates && <><dt>Coordinates (latitude, longitude)</dt><dd>{coordinates[1].toFixed(6)}, {coordinates[0].toFixed(6)}</dd></>}</dl></section>;
}
