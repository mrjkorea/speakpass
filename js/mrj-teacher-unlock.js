/**
 * Server-backed teacher mode (MRJSignin 1.5.0). Never reads localStorage for role.
 */
(function (root) {
  "use strict";

  function isMrjTeacher() {
    try {
      var api = root.MRJSignin || root.MRJ_AUTH;
      return !!(api && typeof api.isTeacher === "function" && api.isTeacher());
    } catch (ignore) {
      return false;
    }
  }

  function installRefresh(onRefresh) {
    if (!root.document || typeof onRefresh !== "function") return;
    root.document.addEventListener("mrj-teacher", function () {
      try {
        onRefresh();
      } catch (ignore) {}
    });
  }

  root.MRJTeacherUnlock = {
    isMrjTeacher: isMrjTeacher,
    installRefresh: installRefresh
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
