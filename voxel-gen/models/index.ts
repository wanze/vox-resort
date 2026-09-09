/**
 * The model registry: every hand-authored object, in the order the showcase
 * lays them out — props first, then the small structures, then the buildings.
 */

import type { VoxelModelSource } from '../voxelgen.ts';
import beach_club from './beach-club.ts';
import beach_umbrella from './beach-umbrella.ts';
import boardwalk from './boardwalk.ts';
import bungalow from './bungalow.ts';
import cottage from './cottage.ts';
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
import palm from './palm.ts';
import path from './path.ts';
import playground from './playground.ts';
import poolside_bar from './poolside-bar.ts';
import resort_bar from './resort-bar.ts';
import restaurant from './restaurant.ts';
import restrooms from './restrooms.ts';
import snack_bar from './snack-bar.ts';
import spa_pavilion from './spa-pavilion.ts';
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

export const MODEL_SOURCES: readonly VoxelModelSource[] = [
  path,
  boardwalk,
  stairs,
  hedge,
  street_lamp,
  flowerbed,
  palm,
  statue,
  sun_lounger,
  beach_umbrella,
  tikitorch,
  icecream,
  entrance,
  fountain,
  snack_bar,
  restrooms,
  first_aid,
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
