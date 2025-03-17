import "reflect-metadata";
import "source-map-support/register";
import { Program } from "@spt/Program";
import { ProgramStatics } from "@spt/ProgramStatics";

ProgramStatics.initialize();
const program = new Program();
program.start();
