import React, { useEffect, useMemo, useState } from 'react';
import type { Session, ConsumptionEvent } from '../types';
import { byTimeAsc, computeSessionDose, computeTolerance, downloadJSON, formatDuration, generateId, getTimeOfDay, intervalSincePrevious, loadSessions, saveSessions, toLocalDateTimeInputValue } from '../utils';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';

const DEFAULT_EFFECTS = [
  'Relaxed', 'Euphoric', 'Creative', 'Talkative', 'Focused', 'Sleepy', 'Hungry', 'Anxious', 'Paranoid', 'Dry mouth'
];

const COLORS = ['#60a5fa','#f87171','#34d399','#fbbf24','#a78bfa','#f472b6','#10b981','#f59e0b','#22d3ee','#c084fc'];

function usePersistentSessions() {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  useEffect(() => { saveSessions(sessions); }, [sessions]);
  return { sessions, setSessions };
}

function useGeoOnStart(enabled: boolean, onGeo: (lat: number, lon: number) => void) {
  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onGeo(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 }
    );
  }, [enabled, onGeo]);
}

function SectionTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <div className="toolbar">{children}</div>
    </div>
  );
}

export function App() {
  const { sessions, setSessions } = usePersistentSessions();
  const active = sessions.find(s => s.active);

  const [form, setForm] = useState({
    substanceType: '',
    weightGrams: 0,
    thcPercent: 20,
    method: 'Joint',
    place: '', weather: '', noise: '', light: '', music: '', activity: '',
    numPeopleSharing: 1,
    lastMeal: '', mood: '', intention: '',
    supplements: '' as string,
    effects: [] as string[],
    notes: ''
  });

  const now = Date.now();
  const tolerance = useMemo(() => computeTolerance(now, sessions), [now, sessions]);
  const totalSessions = sessions.length;
  const avgDuration = useMemo(() => {
    const durations = sessions.filter(s => s.endTime).map(s => (s.endTime! - s.startTime));
    if (!durations.length) return 0;
    return durations.reduce((a,b)=>a+b,0)/durations.length;
  }, [sessions]);

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm(prev => ({ ...prev, [key]: value })); }

  function startSession() {
    const id = generateId();
    const newSession: Session = {
      id,
      startTime: Date.now(),
      active: true,
      timeOfDay: getTimeOfDay(new Date()),
      baseSubstance: { type: form.substanceType || 'Unknown' },
      context: { place: form.place, weather: form.weather, noise: form.noise, light: form.light, music: form.music, activity: form.activity },
      social: { numPeopleSharing: Number(form.numPeopleSharing || 1) },
      user: { lastMeal: form.lastMeal, mood: form.mood, intention: form.intention },
      supplements: form.supplements ? form.supplements.split(',').map(s=>s.trim()).filter(Boolean) : [],
      effects: form.effects,
      notes: form.notes,
      consumptions: []
    };
    const first: ConsumptionEvent = {
      timestamp: Date.now(),
      weightGrams: Number(form.weightGrams || 0),
      thcPercent: Number(form.thcPercent || 0),
      method: form.method,
      notes: undefined
    };
    if (first.weightGrams > 0) newSession.consumptions.push(first);
    setSessions(prev => [...prev, newSession].sort(byTimeAsc));
  }

  useGeoOnStart(!!active, (lat, lon) => {
    // Attach geo to active session when available
    setSessions(prev => prev.map(s => s.active ? { ...s, geo: { lat, lon } } : s));
  });

  function addConsumption() {
    if (!active) return;
    const ev: ConsumptionEvent = {
      timestamp: Date.now(),
      weightGrams: Number(form.weightGrams || 0),
      thcPercent: Number(form.thcPercent || 0),
      method: form.method,
      notes: undefined
    };
    setSessions(prev => prev.map(s => s.id === active.id ? { ...s, consumptions: [...s.consumptions, ev] } : s));
  }

  function updateContext() {
    if (!active) return;
    const updated = {
      context: { place: form.place, weather: form.weather, noise: form.noise, light: form.light, music: form.music, activity: form.activity },
      social: { numPeopleSharing: Number(form.numPeopleSharing || 1) },
      user: { lastMeal: form.lastMeal, mood: form.mood, intention: form.intention },
      supplements: form.supplements ? form.supplements.split(',').map(s=>s.trim()).filter(Boolean) : [],
      effects: form.effects,
      notes: form.notes,
    } as Partial<Session>;
    setSessions(prev => prev.map(s => s.id === active.id ? { ...s, ...updated } : s));
  }

  function endSession() {
    if (!active) return;
    setSessions(prev => prev.map(s => s.id === active.id ? { ...s, active: false, endTime: Date.now() } : s));
  }

  function resumeSession(s: Session) {
    // Mark as active again, keep original startTime
    setSessions(prev => prev.map(x => x.id === s.id ? { ...x, active: true, endTime: undefined } : x));
  }

  function deleteSession(id: string) {
    if (!confirm('Delete this session?')) return;
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  function exportAll() {
    downloadJSON('weed_sessions.json', { sessions, exportedAt: new Date().toISOString(), version: 1 });
  }

  // Charts data
  const sorted = [...sessions].sort(byTimeAsc);
  const chartTolerance = useMemo(() => {
    let points: { t: number; v: number }[] = [];
    const accum: Session[] = [];
    for (const s of sorted) {
      accum.push(s);
      const t = s.endTime ?? s.startTime;
      const v = computeTolerance(t, accum);
      points.push({ t, v: Math.round(v * 10) / 10 });
    }
    return points.map(p => ({ time: new Date(p.t).toLocaleString(), tolerance: p.v }));
  }, [sorted]);

  const chartConsumption = useMemo(() => {
    return sorted.map(s => ({
      time: new Date(s.startTime).toLocaleString(),
      dose: Math.round(computeSessionDose(s) * 1000) / 1000
    }));
  }, [sorted]);

  const chartTimeOfDay = useMemo(() => {
    const counts: Record<string, number> = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    for (const s of sorted) {
      const t = s.timeOfDay ?? getTimeOfDay(new Date(s.startTime));
      counts[t]++;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [sorted]);

  const chartEffects = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sorted) {
      for (const e of s.effects) counts[e] = (counts[e] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [sorted]);

  const activeDuration = active ? Date.now() - active.startTime : 0;

  return (
    <div className="container">
      <h1>Weed Session Manager</h1>

      <div className="kpi">
        <div className="item"><div className="label">Total Sessions</div><div className="value">{totalSessions}</div></div>
        <div className="item"><div className="label">Avg Duration</div><div className="value">{formatDuration(avgDuration)}</div></div>
        <div className="item"><div className="label">Current Tolerance</div><div className="value">{tolerance}</div></div>
      </div>

      <hr className="sep" />

      <SectionTitle title={active ? 'Active Session' : 'Start Session'}>
        {active ? (
          <>
            <button onClick={addConsumption}>Add Consumption</button>
            <button className="secondary" onClick={updateContext}>Update Session</button>
            <button className="danger" onClick={endSession}>End Session</button>
          </>
        ) : (
          <>
            <button onClick={startSession}>Start Session</button>
            <button className="ghost" onClick={exportAll}>Export JSON</button>
          </>
        )}
      </SectionTitle>

      {active && (
        <div className="help">Active for {formatDuration(activeDuration)}{active.geo ? ` ? geo(${active.geo.lat.toFixed(3)}, ${active.geo.lon.toFixed(3)})` : ''} ? {active.timeOfDay}</div>
      )}

      <div className="grid grid-3">
        <div className="card">
          <h3>Substance & Consumption</h3>
          <label>Type
            <input value={form.substanceType} onChange={e=>updateForm('substanceType', e.target.value)} placeholder="Strain or Product" />
          </label>
          <label>Weight (g)
            <input type="number" min="0" step="0.01" value={form.weightGrams} onChange={e=>updateForm('weightGrams', Number(e.target.value))} />
          </label>
          <label>THC (%)
            <input type="number" min="0" max="100" step="0.1" value={form.thcPercent} onChange={e=>updateForm('thcPercent', Number(e.target.value))} />
          </label>
          <label>Method
            <select value={form.method} onChange={e=>updateForm('method', e.target.value)}>
              <option>Joint</option>
              <option>Pipe</option>
              <option>Bong</option>
              <option>Vape</option>
              <option>Edible</option>
              <option>Tincture</option>
              <option>Dab</option>
            </select>
          </label>
        </div>

        <div className="card">
          <h3>Environment & Social</h3>
          <div className="grid grid-2">
            <label>Place<input value={form.place} onChange={e=>updateForm('place', e.target.value)} placeholder="Home, Park, etc." /></label>
            <label>Weather<input value={form.weather} onChange={e=>updateForm('weather', e.target.value)} placeholder="Sunny, Cloudy" /></label>
            <label>Noise<input value={form.noise} onChange={e=>updateForm('noise', e.target.value)} placeholder="Quiet, Loud" /></label>
            <label>Light<input value={form.light} onChange={e=>updateForm('light', e.target.value)} placeholder="Dim, Bright" /></label>
            <label>Music<input value={form.music} onChange={e=>updateForm('music', e.target.value)} placeholder="Genre/Playlist" /></label>
            <label>Activity<input value={form.activity} onChange={e=>updateForm('activity', e.target.value)} placeholder="Movie, Walk" /></label>
          </div>
          <label>People Sharing
            <input type="number" min="1" step="1" value={form.numPeopleSharing} onChange={e=>updateForm('numPeopleSharing', Number(e.target.value))} />
          </label>
        </div>

        <div className="card">
          <h3>User State</h3>
          <div className="grid grid-2">
            <label>Last Meal<input value={form.lastMeal} onChange={e=>updateForm('lastMeal', e.target.value)} placeholder="Time/Type" /></label>
            <label>Mood<input value={form.mood} onChange={e=>updateForm('mood', e.target.value)} placeholder="Calm, Anxious" /></label>
          </div>
          <label>Intention<input value={form.intention} onChange={e=>updateForm('intention', e.target.value)} placeholder="Relax, Sleep, Socialize" /></label>
          <label>Supplements (comma separated)
            <input value={form.supplements} onChange={e=>updateForm('supplements', e.target.value)} placeholder="CBD, L-theanine" />
          </label>
          <label>Effects
            <select multiple value={form.effects} onChange={(e)=>{
              const opts = Array.from(e.target.selectedOptions).map(o=>o.value);
              updateForm('effects', opts);
            }}>
              {DEFAULT_EFFECTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label>Notes
            <textarea value={form.notes} onChange={e=>updateForm('notes', e.target.value)} placeholder="Observations" />
          </label>
        </div>
      </div>

      <hr className="sep" />

      <SectionTitle title="Analytics">
        <span className="help">Dose units are grams THC-equivalent per person</span>
      </SectionTitle>

      <div className="grid grid-3">
        <div className="card">
          <h3>Tolerance Over Time</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartTolerance} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <XAxis dataKey="time" hide/>
                <YAxis width={40} stroke="#93a4b5"/>
                <Tooltip/>
                <Line type="monotone" dataKey="tolerance" stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3>Consumption per Session</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartConsumption} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <XAxis dataKey="time" hide/>
                <YAxis width={40} stroke="#93a4b5"/>
                <Tooltip/>
                <Bar dataKey="dose" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3>Time of Day</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartTimeOfDay} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {chartTimeOfDay.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend/>
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Effects Frequency</h3>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartEffects} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <XAxis dataKey="name" stroke="#93a4b5"/>
              <YAxis width={40} stroke="#93a4b5"/>
              <Tooltip/>
              <Bar dataKey="value" fill="#a78bfa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <hr className="sep" />

      <SectionTitle title="Logbook"/>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Start</th>
              <th>Duration</th>
              <th>Time of Day</th>
              <th>Dose</th>
              <th>People</th>
              <th>Effects</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="help">No sessions yet. Start one above.</td></tr>
            )}
            {sorted.map((s, idx) => {
              const duration = (s.endTime ?? Date.now()) - s.startTime;
              const gap = intervalSincePrevious(sorted, idx);
              return (
                <tr key={s.id}>
                  <td>
                    <div>{new Date(s.startTime).toLocaleString()}</div>
                    <div className="help">{gap !== undefined ? `+${formatDuration(gap)} since prev` : ''}</div>
                  </td>
                  <td>{s.active ? <span className="badge">Active {formatDuration(Date.now()-s.startTime)}</span> : formatDuration(duration)}</td>
                  <td>{s.timeOfDay}</td>
                  <td>{(Math.round(computeSessionDose(s)*1000)/1000).toFixed(3)}</td>
                  <td>{s.social.numPeopleSharing ?? 1}</td>
                  <td>{s.effects.join(', ')}</td>
                  <td>
                    <div className="toolbar">
                      {s.active ? (
                        <button className="secondary" onClick={()=>endSession()}>End</button>
                      ) : (
                        <button onClick={()=>resumeSession(s)}>Resume</button>
                      )}
                      <button className="danger" onClick={()=>deleteSession(s.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
