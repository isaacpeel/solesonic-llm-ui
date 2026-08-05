/*
 * "5 minutes ago" for the label beside a message's copy button. Intl.RelativeTimeFormat owns the
 * wording and the pluralisation; all this has to do is choose a unit and a count.
 *
 * `numeric: 'always'` is deliberate — the 'auto' setting swaps "1 day ago" for "yesterday" and
 * "0 minutes ago" for "this minute", which reads oddly in a list where every other row is a
 * number.
 */
const relativeTimeFormat = new Intl.RelativeTimeFormat('en', {numeric: 'always'});

const MINUTE_MILLISECONDS = 60 * 1000;
const HOUR_MILLISECONDS = 60 * MINUTE_MILLISECONDS;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;
const WEEK_MILLISECONDS = 7 * DAY_MILLISECONDS;
const MONTH_MILLISECONDS = 30 * DAY_MILLISECONDS;
const YEAR_MILLISECONDS = 365 * DAY_MILLISECONDS;

const JUST_NOW_LABEL = 'just now';

/* Largest unit whose own length still divides the elapsed time into a countable number. */
const UNIT_THRESHOLDS = [
    {limit: HOUR_MILLISECONDS, unit: 'minute', unitMilliseconds: MINUTE_MILLISECONDS},
    {limit: DAY_MILLISECONDS, unit: 'hour', unitMilliseconds: HOUR_MILLISECONDS},
    {limit: WEEK_MILLISECONDS, unit: 'day', unitMilliseconds: DAY_MILLISECONDS},
    {limit: MONTH_MILLISECONDS, unit: 'week', unitMilliseconds: WEEK_MILLISECONDS},
    {limit: YEAR_MILLISECONDS, unit: 'month', unitMilliseconds: MONTH_MILLISECONDS},
];

export function formatRelativeTime(date, nowMilliseconds = Date.now()) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }

    const elapsedMilliseconds = nowMilliseconds - date.getTime();

    /*
     * Also catches negatives: the server stamps the message and the browser reads the clock, so
     * a few seconds of skew can date a message in the future. "in 4 seconds" would be nonsense.
     */
    if (elapsedMilliseconds < MINUTE_MILLISECONDS) {
        return JUST_NOW_LABEL;
    }

    for (const {limit, unit, unitMilliseconds} of UNIT_THRESHOLDS) {
        if (elapsedMilliseconds < limit) {
            return relativeTimeFormat.format(-Math.floor(elapsedMilliseconds / unitMilliseconds), unit);
        }
    }

    return relativeTimeFormat.format(-Math.floor(elapsedMilliseconds / YEAR_MILLISECONDS), 'year');
}
