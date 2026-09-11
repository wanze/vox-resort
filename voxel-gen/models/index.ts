/**
 * The model registry: every hand-authored object, in the order the showcase
 * lays them out — props first, then the small structures, then the buildings.
 */

import type { VoxelModelSource } from '../voxelgen.ts';
import beach_club from './beach-club.ts';
import beach_umbrella from './beach-umbrella.ts';
import bench from './bench.ts';
import blossom from './blossom.ts';
import boardwalk from './boardwalk.ts';
import bungalow from './bungalow.ts';
import coffee_shop from './coffee-shop.ts';
import cottage from './cottage.ts';
import cypress from './cypress.ts';
import entrance from './entrance.ts';
import first_aid from './first-aid.ts';
import flowerbed from './flowerbed.ts';
import fountain from './fountain.ts';
import game_hall from './game-hall.ts';
import hedge from './hedge.ts';
import hotel from './hotel.ts';
import house from './house.ts';
import icecream from './icecream.ts';
import minigolf from './minigolf.ts';
import oak from './oak.ts';
import olive from './olive.ts';
import palm from './palm.ts';
import path from './path.ts';
import pine from './pine.ts';
import playground from './playground.ts';
import poolside_bar from './poolside-bar.ts';
import railing from './railing.ts';
import resort_bar from './resort-bar.ts';
import restaurant from './restaurant.ts';
import restrooms from './restrooms.ts';
import snack_bar from './snack-bar.ts';
import spa_pavilion from './spa-pavilion.ts';
import stair_railing from './stair-railing.ts';
import stairs from './stairs.ts';
import statue from './statue.ts';
import street_lamp from './street-lamp.ts';
import sun_lounger from './sun-lounger.ts';
import supermarket from './supermarket.ts';
import swimming_pool from './swimming-pool.ts';
import tennis_court from './tennis-court.ts';
import tikitorch from './tikitorch.ts';
import villa from './villa.ts';
import waterpark from './waterpark.ts';
import willow from './willow.ts';

export const MODEL_SOURCES: readonly VoxelModelSource[] = [
  path,
  boardwalk,
  stairs,
  railing,
  stair_railing,
  hedge,
  street_lamp,
  flowerbed,
  palm,
  pine,
  cypress,
  olive,
  oak,
  blossom,
  willow,
  statue,
  sun_lounger,
  bench,
  beach_umbrella,
  tikitorch,
  icecream,
  entrance,
  fountain,
  snack_bar,
  restrooms,
  first_aid,
  coffee_shop,
  poolside_bar,
  resort_bar,
  spa_pavilion,
  playground,
  bungalow,
  house,
  cottage,
  villa,
  hotel,
  supermarket,
  game_hall,
  restaurant,
  beach_club,
  swimming_pool,
  tennis_court,
  minigolf,
  waterpark,
];
