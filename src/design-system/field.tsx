import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

const control =
  "w-full bg-surface border border-line rounded-[var(--radius-sm)] px-3.5 py-2.5 text-base min-h-11 text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none aria-[invalid=true]:border-danger disabled:bg-sand";

type FieldProps = { label: string; name: string; id?: string; hint?: ReactNode; error?: string[] | string; required?: boolean; className?: string };

function FieldShell({ label, name, hint, error, required, className, children }: FieldProps & { children: ReactNode }) {
  const errors = typeof error === "string" ? [error] : error;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-ink-mute"> *</span> : <span className="text-ink-mute font-normal"> (opcional)</span>}
      </label>
      {children}
      {hint && !errors?.length && (
        <p id={`${name}-hint`} className="text-xs text-ink-mute">
          {hint}
        </p>
      )}
      {errors?.length ? (
        <p id={`${name}-error`} role="alert" className="text-xs text-danger">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (name: string, hint?: ReactNode, error?: unknown) =>
  error && (Array.isArray(error) ? error.length : true) ? `${name}-error` : hint ? `${name}-hint` : undefined;

export function TextField({ label, name, id, hint, error, required, className, ...props }: FieldProps & ComponentProps<"input">) {
  const fid = id ?? name;
  return (
    <FieldShell {...{ label, name: fid, hint, error, required, className }}>
      <input
        id={fid}
        name={name}
        required={required}
        aria-invalid={Boolean(error && error.length) || undefined}
        aria-describedby={describedBy(fid, hint, error)}
        className={control}
        {...props}
      />
    </FieldShell>
  );
}

export function TextArea({ label, name, id, hint, error, required, className, ...props }: FieldProps & ComponentProps<"textarea">) {
  const fid = id ?? name;
  return (
    <FieldShell {...{ label, name: fid, hint, error, required, className }}>
      <textarea
        id={fid}
        name={name}
        required={required}
        rows={4}
        aria-invalid={Boolean(error && error.length) || undefined}
        aria-describedby={describedBy(fid, hint, error)}
        className={control}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  id,
  hint,
  error,
  required,
  className,
  options,
  placeholder,
  ...props
}: FieldProps & ComponentProps<"select"> & { options: Array<{ value: string; label: string }>; placeholder?: string }) {
  const fid = id ?? name;
  return (
    <FieldShell {...{ label, name: fid, hint, error, required, className }}>
      <select
        id={fid}
        name={name}
        required={required}
        aria-invalid={Boolean(error && error.length) || undefined}
        aria-describedby={describedBy(fid, hint, error)}
        className={control}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  error,
  className,
  ...props
}: { label: ReactNode; name: string; error?: string[] | string; className?: string } & ComponentProps<"input">) {
  const errors = typeof error === "string" ? [error] : error;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label className="flex items-start gap-3 text-sm text-ink-soft">
        <input
          type="checkbox"
          name={name}
          id={props.id ?? name}
          className="mt-0.5 size-4 accent-[var(--color-ink)]"
          aria-invalid={Boolean(errors?.length) || undefined}
          {...props}
        />
        <span>{label}</span>
      </label>
      {errors?.length ? (
        <p role="alert" className="text-xs text-danger pl-7">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
