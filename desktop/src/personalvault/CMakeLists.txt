add_executable(PersonalVault
    main.cpp
    PersonalVaultWindow.cpp
    PersonalVaultWindow.h
    personalvault.qrc
)

target_include_directories(PersonalVault PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_BINARY_DIR}/src
)

target_link_libraries(PersonalVault "$<LINK_GROUP:RESCAN,keepassxc_gui,browser>" Qt6::Widgets)

if(WIN32)
    set_target_properties(PersonalVault PROPERTIES WIN32_EXECUTABLE ON)
endif()
