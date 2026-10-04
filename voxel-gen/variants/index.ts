// Styles a catalogue model can also be built in; `of` names the original, whose
// family the variant joins. variants.test.ts holds each one to its original's sim facts.

import type { VoxelModelSource } from '../voxelgen.ts';
import bungalow from './bungalow.ts';
import cottage from './cottage.ts';
import icecream from './icecream.ts';
import palm from './palm.ts';
import poolsideBar from './poolside-bar.ts';
import snackBar from './snack-bar.ts';
import villa from './villa.ts';
import hedge from './hedge.ts';
import streetLamp from './street-lamp.ts';
import litterBin from './litter-bin.ts';
import signPost from './sign-post.ts';
import flowerbed from './flowerbed.ts';
import pine from './pine.ts';
import cypress from './cypress.ts';
import olive from './olive.ts';
import oak from './oak.ts';
import blossom from './blossom.ts';
import willow from './willow.ts';
import statue from './statue.ts';
import sunLounger from './sun-lounger.ts';
import bench from './bench.ts';
import picnicTable from './picnic-table.ts';
import beachUmbrella from './beach-umbrella.ts';
import tikitorch from './tikitorch.ts';
import beachShower from './beach-shower.ts';
import lifeguardTower from './lifeguard-tower.ts';
import entrance from './entrance.ts';
import fountain from './fountain.ts';
import restrooms from './restrooms.ts';
import changingCabins from './changing-cabins.ts';
import firstAid from './first-aid.ts';
import bakery from './bakery.ts';
import coffeeShop from './coffee-shop.ts';
import resortBar from './resort-bar.ts';
import spaPavilion from './spa-pavilion.ts';
import pedaloRental from './pedalo-rental.ts';
import kidsClub from './kids-club.ts';
import playground from './playground.ts';
import house from './house.ts';
import hotel from './hotel.ts';
import supermarket from './supermarket.ts';
import reception from './reception.ts';
import gymPavilion from './gym-pavilion.ts';
import gameHall from './game-hall.ts';
import restaurant from './restaurant.ts';
import beachClub from './beach-club.ts';
import swimmingPool from './swimming-pool.ts';
import tennisCourt from './tennis-court.ts';
import basketballCourt from './basketball-court.ts';
import volleyball from './volleyball.ts';
import minigolf from './minigolf.ts';
import { MOSAIC_VARIANTS } from '../mosaics/index.ts';

export interface ModelVariant {
  readonly of: string;
  readonly source: VoxelModelSource;
}

export const VARIANTS: readonly ModelVariant[] = [
  { of: 'palm', source: palm },
  { of: 'icecream', source: icecream },
  { of: 'snack-bar', source: snackBar },
  { of: 'poolside-bar', source: poolsideBar },
  { of: 'bungalow', source: bungalow },
  { of: 'cottage', source: cottage },
  { of: 'villa', source: villa },
  { of: 'hedge', source: hedge },
  { of: 'street-lamp', source: streetLamp },
  { of: 'litter-bin', source: litterBin },
  { of: 'sign-post', source: signPost },
  { of: 'flowerbed', source: flowerbed },
  { of: 'pine', source: pine },
  { of: 'cypress', source: cypress },
  { of: 'olive', source: olive },
  { of: 'oak', source: oak },
  { of: 'blossom', source: blossom },
  { of: 'willow', source: willow },
  { of: 'statue', source: statue },
  { of: 'sun-lounger', source: sunLounger },
  { of: 'bench', source: bench },
  { of: 'picnic-table', source: picnicTable },
  { of: 'beach-umbrella', source: beachUmbrella },
  { of: 'tikitorch', source: tikitorch },
  { of: 'beach-shower', source: beachShower },
  { of: 'lifeguard-tower', source: lifeguardTower },
  { of: 'entrance', source: entrance },
  { of: 'fountain', source: fountain },
  { of: 'restrooms', source: restrooms },
  { of: 'changing-cabins', source: changingCabins },
  { of: 'first-aid', source: firstAid },
  { of: 'bakery', source: bakery },
  { of: 'coffee-shop', source: coffeeShop },
  { of: 'resort-bar', source: resortBar },
  { of: 'spa-pavilion', source: spaPavilion },
  { of: 'pedalo-rental', source: pedaloRental },
  { of: 'kids-club', source: kidsClub },
  { of: 'playground', source: playground },
  { of: 'house', source: house },
  { of: 'hotel', source: hotel },
  { of: 'supermarket', source: supermarket },
  { of: 'reception', source: reception },
  { of: 'gym-pavilion', source: gymPavilion },
  { of: 'game-hall', source: gameHall },
  { of: 'restaurant', source: restaurant },
  { of: 'beach-club', source: beachClub },
  { of: 'swimming-pool', source: swimmingPool },
  { of: 'tennis-court', source: tennisCourt },
  { of: 'basketball-court', source: basketballCourt },
  { of: 'volleyball', source: volleyball },
  { of: 'minigolf', source: minigolf },
  ...MOSAIC_VARIANTS,
];

export const VARIANT_SOURCES: readonly VoxelModelSource[] = VARIANTS.map(
  (variant) => variant.source,
);
