import { afterEach, describe, expect, it, vi } from "vitest";
import { googleTagBootstrap, trackGooglePageView } from "@/lib/google-analytics";

afterEach(() => vi.unstubAllGlobals());

describe("Google Analytics", () => {
  it("disables automatic page views so route tracking does not duplicate them", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { dataLayer: [], gtag });
    new Function(googleTagBootstrap("G-TEST123"))();
    expect(gtag).toHaveBeenCalledWith("config", "G-TEST123", { send_page_view: false });
  });

  it("sends route page views without sensitive query strings or fragments", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag, location: { origin: "https://civimeet.com", search: "?email=private", hash: "#access_token=private" } });
    vi.stubGlobal("document", { title: "CiviMeet Product" });
    trackGooglePageView("G-TEST123", "/product");
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "page_view", {
      send_to: "G-TEST123", page_path: "/product", page_location: "https://civimeet.com/product", page_title: "CiviMeet Product",
    });
  });
});