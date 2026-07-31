import './GeneratedImageProgress.css';

/**
 * The in-flight square. Same footprint as the finished image, so the swap on arrival costs
 * no reflow.
 *
 * The percentage drives the bar's width only — it is a time-based estimate that sits at 85
 * on a slow run, so it is never printed as a number and the bar is labelled indeterminate
 * to assistive technology. The step message is the honest signal.
 */
function GeneratedImageProgress({progressMessage, progressPercent, onCancel}) {
    const clampedPercent = Math.min(100, Math.max(0, typeof progressPercent === 'number' ? progressPercent : 0));

    return (
        <div className="generated-image-progress">
            <div className="generated-image-progress-frame" role="status" aria-live="polite">
                <span className="generated-image-progress-spinner" aria-hidden="true"/>
                <span className="generated-image-progress-message">
                    {progressMessage || 'Generating…'}
                </span>

                <div
                    className="generated-image-progress-track"
                    role="progressbar"
                    aria-valuetext={progressMessage || 'Generating'}
                    aria-label="Image generation progress"
                >
                    <div
                        className="generated-image-progress-fill"
                        style={{width: `${clampedPercent}%`}}
                    />
                </div>
            </div>

            {onCancel && (
                <button type="button" className="generated-image-progress-cancel" onClick={onCancel}>
                    Cancel
                </button>
            )}
        </div>
    );
}

export default GeneratedImageProgress;
