/**
 * Example firmware that depends on SolderLab-generated board.h.
 * If upstream BSC reassigns SDA/SCL pads, `solderlab bsc check --scan`
 * must fail and print these call sites.
 */
#include "board.h"
#include <stdio.h>

#ifndef SOLDERLAB_BSC_VERSION
#error "board.h missing SOLDERLAB_BSC_VERSION — run solderlab bsc pull"
#endif

static void i2c_bitbang_init(void) {
  /* Call sites intentionally use BSC macros so --scan can find them. */
  const int sda = SOLDERLAB_PIN_SDA;
  const int scl = SOLDERLAB_PIN_SCL;
  printf("glasgow i2c sda=%d scl=%d\n", sda, scl);
}

int main(void) {
  i2c_bitbang_init();
  return 0;
}
