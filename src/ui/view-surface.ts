export interface ViewSurfaceInput {
  active: boolean;
  mobile: boolean;
  detailsOpen: boolean;
}

export interface ViewSurfaceVisibility {
  graphIntroduction: boolean;
  detailsContext: boolean;
}

/**
 * An active view has one primary explanatory surface at a time on a thin screen.
 * The graph owns it while details are closed; the details sheet owns it while open.
 */
export function resolveViewSurface(input: ViewSurfaceInput): ViewSurfaceVisibility {
  if (!input.active) return { graphIntroduction: false, detailsContext: false };
  if (input.mobile && input.detailsOpen) {
    return { graphIntroduction: false, detailsContext: true };
  }
  return {
    graphIntroduction: true,
    detailsContext: false
  };
}
