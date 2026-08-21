cmake_minimum_required(VERSION 3.10)
project(SolderLabPhysics C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

set(THREADS_PREFER_PTHREAD_FLAG ON)
find_package(Threads REQUIRED)

set(VENDOR ${CMAKE_CURRENT_SOURCE_DIR}/vendor/new_sch)

add_executable(solderlab-physics
  src/json_cli.c
  ${VENDOR}/db.c
  ${VENDOR}/catalogue.c
  ${VENDOR}/jlcparts_import.c
  ${VENDOR}/physics.c
  ${VENDOR}/ac_physics.c
  ${VENDOR}/cJSON.c
  ${VENDOR}/sqlite3.c
)

target_include_directories(solderlab-physics PRIVATE ${VENDOR})
target_link_libraries(solderlab-physics PRIVATE Threads::Threads)
if(UNIX)
  target_link_libraries(solderlab-physics PRIVATE m)
endif()

# Quiet third-party amalgamation noise
if(MSVC)
  target_compile_options(solderlab-physics PRIVATE /W0)
else()
  target_compile_options(solderlab-physics PRIVATE -w)
endif()

set_target_properties(solderlab-physics PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/bin
  RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_CURRENT_SOURCE_DIR}/bin
  RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_CURRENT_SOURCE_DIR}/bin
)
