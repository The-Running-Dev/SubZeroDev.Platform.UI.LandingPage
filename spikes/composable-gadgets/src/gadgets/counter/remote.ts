/**
 * The runtime entry. It adds nothing: the remote bundle is the same descriptor
 * behind a URL. Its own CSS is imported here so the built bundle emits a
 * stylesheet the manifest can name.
 */
import "./counter.css";
export { default } from "./module.js";
