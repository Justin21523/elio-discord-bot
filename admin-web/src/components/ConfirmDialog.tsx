import React, { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  phrase?: string;
  confirmLabel: string;
  confirmTone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog(props: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (props.open) setValue("");
  }, [props.open]);

  const canConfirm = useMemo(() => {
    if (props.busy) return false;
    if (!props.phrase) return true;
    return value.trim() === props.phrase;
  }, [props.busy, props.phrase, value]);

  if (!props.open) return null;

  return (
    <div className="modalOverlay" role="presentation" onMouseDown={props.onCancel}>
      <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">{props.title}</div>
        </div>

        {props.description ? <div className="modalDescription">{props.description}</div> : null}

        {props.phrase ? (
          <label className="modalField">
            <div className="modalFieldLabel">
              Type <code>{props.phrase}</code> to confirm
            </div>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={props.phrase}
              autoFocus
            />
          </label>
        ) : null}

        <div className="modalActions">
          <button className="button" type="button" onClick={props.onCancel} disabled={props.busy}>
            Cancel
          </button>
          <button
            className={props.confirmTone === "danger" ? "button danger" : "button primary"}
            type="button"
            onClick={props.onConfirm}
            disabled={!canConfirm}
          >
            {props.busy ? "Working…" : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

