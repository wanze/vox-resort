import { describe, expect, it } from 'vitest';
import referenceJson from '../../../../fixtures/reference-resort.json';
import { bedsOf, hireOf, sceneryOf, venueOf } from '../../catalog/domain/objectTypes';
import { shoreFor } from '../../layout/domain/shoreline';
import { terrainFor } from '../../layout/domain/terrain';
import { referenceWorldOf } from '../../resort-prep/domain/referenceResort';
import { planOfWorld } from '../../resort-prep/domain/savedWorld';
import { withBeach } from '../../sim/domain/beach';
import { depotsOn } from '../../sim/domain/depots';
import { gatewaysOn } from '../../sim/domain/gateways';
import { homesOfLodgings, lodgingsOn } from '../../sim/domain/lodgings';
import { sceneryFieldFor, sceneryItemsOf } from '../../sim/domain/scenery';
import { venuesOn } from '../../sim/domain/venues';
import { plotFactsOf, type PlotFacts } from './plotFacts';

const world = referenceWorldOf(referenceJson);
const plan = planOfWorld(world);
const ground = { plan, shore: shoreFor(plan), terrain: terrainFor(plan) };
const sources = { placements: world.placements, props: world.props, paths: world.paths };

// paving.at is a closure, so it compares by reference and is checked tile by tile instead.
const withoutPaving = (facts: PlotFacts): Record<string, unknown> =>
  Object.fromEntries(Object.entries(facts).filter(([key]) => key !== 'paving'));

describe('plotFactsOf', () => {
  it('puts together what each domain function says about the reference resort', () => {
    const facts = plotFactsOf(ground, sources, new Map());
    expect(facts.venues).toEqual(venuesOn(world.placements, facts.names));
    expect(facts.lodgings).toEqual(lodgingsOn(world.placements));
    expect(facts.gateways).toEqual(gatewaysOn(world.placements));
    expect(facts.depots).toEqual(depotsOn(world.placements));
    expect(facts.siteVenues).toEqual(withBeach(facts.venues, facts.network));
    expect(facts.homeOfLodging).toEqual(homesOfLodgings(facts.lodgings, facts.homes));
    expect(facts.scenery).toEqual(
      sceneryFieldFor(
        sceneryItemsOf([...world.placements, ...world.props, ...world.paths], sceneryOf),
        plan.tilesX,
        plan.tilesZ,
      ),
    );
  });

  it('houses nobody in a stranded lodging, biggest homes first', () => {
    const { homes, unreachable } = plotFactsOf(ground, sources, new Map());
    expect(homes.length).toBeGreaterThan(0);
    for (const home of homes) {
      expect(unreachable.has(home.key)).toBe(false);
      expect(home.beds).toBeGreaterThan(0);
    }
    expect(homes).toEqual(homes.toSorted((a, b) => b.beds - a.beds || a.key.localeCompare(b.key)));
  });

  it('numbers every venue by key, the beach last among the sites', () => {
    const facts = plotFactsOf(ground, sources, new Map());
    facts.venues.forEach((venue, at) => expect(facts.venueIndex.get(venue.key)).toBe(at));
    facts.siteVenues.forEach((venue, at) => expect(facts.siteVenueIndex.get(venue.key)).toBe(at));
    expect(facts.siteVenueIndex.size).toBe(facts.siteVenues.length);
    const hiring = facts.venues.filter((venue) => hireOf(venue.id));
    expect(hiring.length).toBeGreaterThan(0);
    expect([...facts.rentalVenues]).toEqual(
      hiring.map((venue) => [venue.key, facts.venueIndex.get(venue.key)]),
    );
  });

  it('pins the reference resort', () => {
    const facts = plotFactsOf(ground, sources, new Map());
    const summary = {
      venues: facts.venues.length,
      siteVenues: facts.siteVenues.length,
      lodgings: facts.lodgings.length,
      gateways: facts.gateways.length,
      depots: facts.depots.length,
      unreachable: facts.unreachable.size,
      homes: facts.homes.length,
      beds: facts.homes.reduce((sum, home) => sum + home.beds, 0),
      nodes: facts.network.nodes.length,
      rentalVenues: facts.rentalVenues.size,
      stages: facts.stages.length,
      names: facts.names.size,
      beachTiles: facts.beachTiles,
      launchSites: facts.launchSites.length,
      binCover: facts.binCover.reduce((sum, cover) => sum + cover, 0),
    };
    expect(summary).toMatchInlineSnapshot(`
      {
        "beachTiles": 1536,
        "beds": 282,
        "binCover": 483,
        "depots": 1,
        "gateways": 1,
        "homes": 44,
        "launchSites": 5,
        "lodgings": 44,
        "names": 35,
        "nodes": 1146,
        "rentalVenues": 2,
        "siteVenues": 58,
        "stages": 6,
        "unreachable": 0,
        "venues": 57,
      }
    `);
  });

  it('gives an edited plot the facts a fresh build of the same lists gives', () => {
    const venue = world.placements.find((each) => {
      const role = venueOf(each.id)?.role;
      return role !== undefined && role !== 'lodging';
    })!;
    const lodging = world.placements.find((each) => bedsOf(each.id) > 0)!;
    const rest = world.placements.filter((each) => each !== venue && each !== lodging);
    const editedLists = {
      placements: [...rest, venue, lodging],
      props: [...world.props],
      paths: [...world.paths],
    };
    const before = plotFactsOf(ground, sources, new Map());
    const edited = plotFactsOf(ground, editedLists, before.names);
    const fresh = plotFactsOf(ground, structuredClone(editedLists), new Map());
    expect(withoutPaving(edited)).toEqual(withoutPaving(fresh));
    for (const node of fresh.network.nodes) {
      expect(edited.paving.at(node.tileX, node.tileZ)).toEqual(
        fresh.paving.at(node.tileX, node.tileZ),
      );
    }
    expect(edited.venueIndex.get(venue.key)).toBe(edited.venues.length - 1);
    expect(edited.venueIndex.get(venue.key)).not.toBe(before.venueIndex.get(venue.key));
    expect(edited.names).toEqual(before.names);
  });
});
