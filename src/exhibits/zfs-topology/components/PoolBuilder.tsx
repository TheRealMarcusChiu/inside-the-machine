import { useId } from 'react';
import { ExhibitFigure } from '../../../components/ExhibitFigure';
import { capacity, LAYOUT_LABEL, LAYOUTS, LIMITS, totalDisks, widthBounds, type PoolConfig } from '../model/topology';
import { describeConfig, fmtPercent, fmtTB, fmtTiB, zpoolCreateCommand } from '../format';
import type { ZfsUrlState } from '../urlConfig';

export const BUILDER_FIGURE_ID = 'zfs-pool-builder';

function Slider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  const id = useId();
  return (
    <div className="zfs-slider">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={unit ? `${value} ${unit}` : String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output htmlFor={id} className="zfs-slider__value">
        {value}
        {unit ? ` ${unit}` : ''}
      </output>
    </div>
  );
}

export function PoolBuilder({ config, onChange }: { config: PoolConfig; onChange: (p: Partial<ZfsUrlState>) => void }) {
  const name = useId();
  const cap = capacity(config);
  const w = widthBounds(config.layout);
  const usablePct = cap.efficiency * 100;

  return (
    <ExhibitFigure
      kind="simulation"
      id={BUILDER_FIGURE_ID}
      title="Pool builder"
      description="Choose a layout and geometry; capacity is recomputed instantly."
    >
      <div className="zfs-builder">
        <fieldset className="segmented">
          <legend>Layout of every top-level vdev</legend>
          {LAYOUTS.map((l) => (
            <label key={l} className="segmented__option">
              <input
                type="radio"
                name={name}
                value={l}
                checked={config.layout === l}
                onChange={() => onChange({ layout: l })}
              />
              <span>{LAYOUT_LABEL[l]}</span>
            </label>
          ))}
        </fieldset>

        <div className="zfs-builder__sliders">
          <Slider
            label="Disks per vdev"
            value={config.width}
            min={w.min}
            max={w.max}
            onChange={(width) => onChange({ width })}
          />
          <Slider
            label="Top-level vdevs"
            value={config.vdevs}
            min={LIMITS.vdevs.min}
            max={LIMITS.vdevs.max}
            onChange={(vdevs) => onChange({ vdevs })}
          />
          <Slider
            label="Disk size"
            unit="TB"
            value={config.diskSizeTB}
            min={LIMITS.diskSizeTB.min}
            max={LIMITS.diskSizeTB.max}
            onChange={(diskSizeTB) => onChange({ diskSizeTB })}
          />
        </div>

        <p className="zfs-builder__summary" aria-live="polite">
          <strong>{describeConfig(config)}</strong> · {totalDisks(config)} disks of {fmtTB(config.diskSizeTB)}
        </p>
        <pre className="zfs-command" aria-label="Equivalent zpool create command, with placeholder disk names">
          <code>{zpoolCreateCommand(config)}</code>
        </pre>

        <dl className="zfs-capacity">
          <div className="zfs-capacity__item">
            <dt>Raw</dt>
            <dd data-testid="cap-raw">{fmtTB(cap.rawTB)}</dd>
            <dd className="zfs-capacity__note">
              {fmtTiB(cap.rawTB)} · every disk added up — what you bought
            </dd>
          </div>
          <div className="zfs-capacity__item zfs-capacity__item--usable">
            <dt>Estimated usable</dt>
            <dd data-testid="cap-usable">{fmtTB(cap.estimatedUsableTB)}</dd>
            <dd className="zfs-capacity__note">
              {fmtTiB(cap.estimatedUsableTB)} · {fmtPercent(cap.efficiency)} of raw · from geometry alone
            </dd>
          </div>
          <div className="zfs-capacity__item zfs-capacity__item--free">
            <dt>Live free space</dt>
            <dd data-testid="cap-free">Not predicted</dd>
            <dd className="zfs-capacity__note">
              only a real pool can report it (<code>zfs list</code> AVAIL) — always less than the estimate
            </dd>
          </div>
        </dl>

        <div
          className="zfs-bar"
          role="img"
          aria-label={`Of ${fmtTB(cap.rawTB)} raw, about ${fmtTB(cap.estimatedUsableTB)} is estimated usable and ${fmtTB(cap.redundancyTB)} holds ${config.layout === 'mirror' ? 'mirror copies' : 'parity'}.`}
        >
          <span className="zfs-bar__usable" style={{ width: `${usablePct}%` }}>
            usable ≈ {fmtPercent(cap.efficiency)}
          </span>
          <span className="zfs-bar__redundancy" style={{ width: `${100 - usablePct}%` }}>
            {config.layout === 'mirror' ? 'copies' : 'parity'}
          </span>
        </div>

        <p className="zfs-disclaimer">
          <strong>Geometry estimate — not a zpool capacity prediction.</strong> It uses the zpoolconcepts(7) rules of
          thumb: a mirror holds one disk’s worth, a RAIDZ vdev holds about (N − P) disks’ worth. A real pool reports
          less after metadata, reserved space, RAIDZ padding and the data you store.
        </p>
      </div>
    </ExhibitFigure>
  );
}
