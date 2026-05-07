import { strict as assert } from "node:assert";
import test from "node:test";

import {
  scrapeEngineTestInternals,
  type MapsDetailSnapshot,
  type MapsListing,
} from "./scrape-engine";

const place: MapsListing = {
  ariaLabel: "Closets by Design - Niagara",
  cardText: "",
  name: "Closets by Design - Niagara",
  url: "https://www.google.com/maps/place/Closets+by+Design+-+Niagara",
  websiteUrl: "",
};

test("maps detail extraction prefers the authority website and contact fields", () => {
  const raw: MapsDetailSnapshot = {
    addressText: "Address: 400 Millen Rd Unit A & B, Stoney Creek, ON L8E 2P7",
    bodyText: [
      "Closets by Design - Niagara",
      "4.7",
      "Cabinet maker",
      "closetsbydesign.com",
      "niagara.closetsbydesign.com",
      "(905) 468-4611",
    ].join("\n"),
    categoryText: "Cabinet maker",
    h1: "Closets by Design - Niagara",
    metaTitle: "",
    ogTitle: "",
    phoneDataId: "phone:tel:+19054684611",
    phoneHref: "",
    ratingAriaLabel: "4.7 stars 714 reviews",
    ratingText: "",
    websiteHref: "https://niagara.closetsbydesign.com/?source=gmap",
  };

  const result = scrapeEngineTestInternals.extractMapsDetailFromSnapshot(raw, place, place.name, {
    address: "",
    category: "",
    phone: "",
    ratingText: "",
    title: place.name,
    website: "",
  });

  assert.equal(result.title, "Closets by Design - Niagara");
  assert.equal(result.website, "https://niagara.closetsbydesign.com/?source=gmap");
  assert.equal(result.phone, "+19054684611");
  assert.match(result.address, /400 Millen Rd/);
  assert.equal(result.category, "Cabinet maker");
  assert.equal(result.detailMode, "direct");
});

test("body-text website fallback uses the final Maps domain line", () => {
  const website = scrapeEngineTestInternals.extractWebsiteFromBodyText([
    "Open booking link",
    "closetsbydesign.com",
    "Open website",
    "niagara.closetsbydesign.com",
  ].join("\n"));

  assert.equal(website, "https://niagara.closetsbydesign.com/");
});

test("listing-card website survives when Maps detail rendering is blank", () => {
  const fallback = scrapeEngineTestInternals.buildMapsListingFallback({
    ariaLabel: "Plumber To Your Door of Waterloo",
    cardText: "Plumber To Your Door of Waterloo  4.9 Plumber Open · (519) 498-0562 Website Directions",
    name: "Plumber To Your Door of Waterloo",
    url: "https://www.google.com/maps/place/Plumber+To+Your+Door+of+Waterloo",
    websiteUrl: "https://plumbertoyourdoor.ca/plumber-kitchener/",
  });

  const result = scrapeEngineTestInternals.extractMapsDetailFromSnapshot(
    {
      addressText: "",
      bodyText: "",
      categoryText: "",
      h1: "",
      metaTitle: "",
      ogTitle: "",
      phoneDataId: "",
      phoneHref: "",
      ratingAriaLabel: "",
      ratingText: "",
      websiteHref: "",
    },
    {
      ariaLabel: fallback.title,
      cardText: "",
      name: fallback.title,
      url: "https://www.google.com/maps/place/Plumber+To+Your+Door+of+Waterloo",
      websiteUrl: fallback.website,
    },
    fallback.title,
    fallback,
  );

  assert.equal(result.website, "https://plumbertoyourdoor.ca/plumber-kitchener/");
  assert.equal(result.phone, "(519) 498-0562");
});
