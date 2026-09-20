import { useMemo, useState } from 'react';
import { Card, EmptyState, ActionPill, Avatar } from '../ui.jsx';
import { ACTIONS, ACTION_ORDER, LINE, MUTE, personColor } from '../theme.js';
import { absoluteTime, relativeTime, dayKey } from '../lib/time.js';
import { downloadCSV } from '../lib/csv.js';
import {
  ALL,
  BUCKETS,
  CSV_HEADERS,
  activityCSVRows,
  engagementSeries,
  filterActivity,
  peopleIn,
  totalsByPerson,
} from '../lib/activity.js';

const BLANK_FILTERS = { person: ALL, categoryId: ALL, action: ALL, from: '', to: '' };

function bucketLabel(key, bucket) {
  if (bucket === 'month') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const short = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return bucket === 'week' ? `wk ${short}` : short;
}

// A stacked bar per time bucket, one band per person -- the same hand-rolled
// SVG approach the Household Ledger's dashboard charts use (no charting
// dependency, viewBox-scaled so it stays sharp and responsive). "Engagement"
// here is simply how many logged actions each person took in the bucket.
function EngagementChart({ series, bucket, roster }) {
  const [hover, setHover] = useState(null);

  if (series.rows.length === 0) {
    return <EmptyState>Nothing matches these filters, so there's nothing to chart.</EmptyState>;
  }

  const W = 720;
  const H = 240;
  const PAD_L = 42;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 38;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = Math.max(series.max, 1);
  const groupW = innerW / series.rows.length;
  const barW = Math.min(34, groupW * 0.6);
  const x = (i) => PAD_L + groupW * i + groupW / 2;
  const gridLines = 4;

  // Keep the y-axis on whole numbers -- these are counts of things people
  // did, and "2.5 posts" is not a thing that happened.
  const step = Math.max(1, Math.ceil(max / gridLines));
  const axisMax = step * gridLines;
  const h = (v) => (v / axisMax) * innerH;

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="chart"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Activity per person, by ${bucket}`}
      >
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const gy = PAD_T + (innerH / gridLines) * i;
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={gy} y2={gy} stroke={LINE} />
              <text x={PAD_L - 8} y={gy + 3.5} textAnchor="end" fontSize="10" fill={MUTE}>
                {axisMax - step * i}
              </text>
            </g>
          );
        })}

        {series.rows.map((row, i) => {
          let cursor = PAD_T + innerH;
          return (
            <g key={row.key} onMouseEnter={() => setHover(i)}>
              {series.people.map((person) => {
                const value = row.counts[person.id] || 0;
                if (value <= 0) return null;
                const barH = h(value);
                cursor -= barH;
                return (
                  <rect
                    key={person.id}
                    x={x(i) - barW / 2}
                    y={cursor}
                    width={barW}
                    height={barH}
                    fill={personColor(person.id, roster)}
                  />
                );
              })}
              {/* Full-height hit target so hovering the gap above a short bar still works. */}
              <rect x={x(i) - groupW / 2} y={PAD_T} width={groupW} height={innerH} fill="transparent" />
              <text x={x(i)} y={H - 14} textAnchor="middle" fontSize="9.5" fill={MUTE}>
                {bucketLabel(row.key, bucket)}
              </text>
            </g>
          );
        })}
      </svg>

      {hover !== null ? (
        <div className="chart-tip">
          <span className="chart-tip-key">{bucketLabel(series.rows[hover].key, bucket)}</span>
          {series.people.map((person) => {
            const value = series.rows[hover].counts[person.id] || 0;
            if (!value) return null;
            return (
              <span key={person.id} style={{ color: personColor(person.id, roster) }}>
                {person.name} {value}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function ActivityLog({ activityLog, categories, roster }) {
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [bucket, setBucket] = useState('week');

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  // People come from the whole log, not the filtered slice, so the person
  // dropdown doesn't empty itself out the moment you filter by someone.
  const allPeople = useMemo(() => peopleIn(activityLog), [activityLog]);
  const filtered = useMemo(() => filterActivity(activityLog, filters), [activityLog, filters]);
  const series = useMemo(() => engagementSeries(filtered, bucket), [filtered, bucket]);
  const totals = useMemo(() => totalsByPerson(filtered), [filtered]);

  const dirty = JSON.stringify(filters) !== JSON.stringify(BLANK_FILTERS);

  const exportCSV = () => {
    downloadCSV(
      `the-forum-activity-${dayKey(Date.now())}.csv`,
      CSV_HEADERS,
      activityCSVRows(filtered, (action) => ACTIONS[action]?.label || action),
    );
  };

  return (
    <div className="page activity-page">
      <div className="page-head">
        <h1>Activity Log</h1>
        <p>Every category, thread, post, comment and reply anyone has created -- who, when, what, and where.</p>
      </div>

      <Card className="filters-card">
        <div className="filters">
          <label className="field">
            <span>Person</span>
            <select className="input" value={filters.person} onChange={set('person')}>
              <option value={ALL}>Everyone</option>
              {allPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Category</span>
            <select className="input" value={filters.categoryId} onChange={set('categoryId')}>
              <option value={ALL}>All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Action</span>
            <select className="input" value={filters.action} onChange={set('action')}>
              <option value={ALL}>All actions</option>
              {ACTION_ORDER.map((key) => (
                <option key={key} value={key}>
                  {ACTIONS[key].label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>From</span>
            <input className="input" type="date" value={filters.from} max={filters.to || undefined} onChange={set('from')} />
          </label>

          <label className="field">
            <span>To</span>
            <input className="input" type="date" value={filters.to} min={filters.from || undefined} onChange={set('to')} />
          </label>

          <div className="filter-actions">
            {dirty ? (
              <button type="button" className="link-btn" onClick={() => setFilters(BLANK_FILTERS)}>
                Clear filters
              </button>
            ) : null}
            <button type="button" className="btn-primary btn-small" onClick={exportCSV} disabled={filtered.length === 0}>
              Export CSV
            </button>
          </div>
        </div>
      </Card>

      <Card className="chart-card">
        <div className="chart-head">
          <h2>Engagement over time</h2>
          <div className="bucket-switch">
            {BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`bucket-btn ${bucket === b.id ? 'is-active' : ''}`}
                onClick={() => setBucket(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <EngagementChart series={series} bucket={bucket} roster={roster} />

        {totals.length > 0 ? (
          <ul className="chart-legend">
            {totals.map((p) => (
              <li key={p.id}>
                <span className="legend-dot" style={{ background: personColor(p.id, roster) }} />
                {p.name}
                <strong>{p.count}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <div className="section-head">
        <h2>The record</h2>
        <span className="section-count">
          {filtered.length}
          {dirty ? ` of ${activityLog.length}` : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>No activity matches these filters.</EmptyState>
      ) : (
        <Card className="table-card">
          <div className="table-scroll">
            <table className="activity-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Where</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td className="col-when" title={absoluteTime(entry.createdAt)}>
                      {relativeTime(entry.createdAt)}
                    </td>
                    <td className="col-who">
                      <Avatar name={entry.actorName} personId={entry.actorId} roster={roster} size="sm" />
                      {entry.actorName}
                    </td>
                    <td>
                      <ActionPill action={entry.action} />
                    </td>
                    <td className="col-where">{entry.breadcrumb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
