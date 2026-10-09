import { PHOTO_FILTER_IDS, PHOTO_FILTERS, svgValuesOf } from '../domain/photoFilters';

const photoFilterId = (id: string): string => `photo-${id}`;

// The same matrices the saved file gets, on sRGB bytes as the file's are, so the preview matches it.
export function PhotoFilterDefs() {
  return (
    <svg className="photo-filter-defs" aria-hidden="true" focusable="false">
      {PHOTO_FILTER_IDS.map((id) => (
        <filter key={id} id={photoFilterId(id)} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={svgValuesOf(PHOTO_FILTERS[id].matrix)} />
        </filter>
      ))}
    </svg>
  );
}
