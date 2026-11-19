// The site has two addresses: the explorer at <root>/ and the study at <root>/study/.
// Both pages load the same app, so paths are worked out from the page's own address.
const STUDY_PATH = /study(\/(index\.html)?)?$/;

export function isStudyPath(): boolean {
  return STUDY_PATH.test(window.location.pathname);
}

/** Path of the site root with a trailing slash, e.g. "/interpretability_uncertainty/". */
export function siteRoot(): string {
  return window.location.pathname.replace(STUDY_PATH, '').replace(/[^/]*$/, '');
}
