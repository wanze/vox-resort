import { PixelIcon } from '../../../shared/components/PixelIcon';
import { remedyWords } from '../domain/bookingWords';
import type { RequirementCheck } from '../domain/bookingsView';
import { requirementNoun } from '../domain/requirements';

function Wish({ check }: { readonly check: RequirementCheck }) {
  const { requirement, met } = check;
  return (
    <li data-met={met}>
      <PixelIcon name={met ? 'check' : 'minus'} scale={1} />
      <span>
        <span>
          {requirementNoun(requirement)}
          <span className="ui-visually-hidden">{met ? ', in place' : ', missing'}</span>
        </span>
        {met ? null : (
          <span className="bookings-checks-remedy">{remedyWords(requirement, check.builds)}</span>
        )}
      </span>
    </li>
  );
}

// Offered only once the group has a wish: a heading over nothing would read as a missing list.
export function Checks({ checks }: { readonly checks: readonly RequirementCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <div className="bookings-wishes">
      <span className="ui-label">They want</span>
      <ul className="bookings-checks" aria-label="They want">
        {checks.map((check) => (
          <Wish key={`${check.requirement.kind}:${check.requirement.value}`} check={check} />
        ))}
      </ul>
    </div>
  );
}
